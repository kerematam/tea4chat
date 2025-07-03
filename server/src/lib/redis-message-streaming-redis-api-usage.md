# Redis Message Streaming - API Usage Explanation

This document explains how different Redis APIs work together to provide **resumable streaming** - the ability for users to continue receiving LLM message chunks even after page refresh or when accessing from different devices.

## Core Architecture

The system uses **4 different Redis data structures** working together:

### 1. Sequence Counter (`seqKey`)
**Pattern**: `message-stream-<chat-id>:seq`
**API**: `redis.incr(seqKey)`

```typescript
const seqKey = `${getStreamName(chatId)}:seq`;
const nextSeq = (await redis.incr(seqKey)) - 1; // zero-based index
```

**Purpose**: 
- Provides **globally unique, monotonic sequence numbers** for each chat
- Ensures **proper ordering** of events even in clustered/concurrent environments
- Acts as the "backbone" for event ordering across all other data structures

### 2. Individual Event Storage (`eventKey`)
**Pattern**: `message-stream-<chat-id>:events:<seq-number>`
**API**: `redis.setex(eventKey, 3600, JSON.stringify(event))`

```typescript
const eventKey = `${streamName}:events:${nextSeq.toString().padStart(9, '0')}`;
await redis.setex(eventKey, 3600, JSON.stringify(event)); // 1 hour TTL
```

**Purpose**:
- Stores **individual events** for direct lookup by sequence number
- Provides **redundant storage** in case sorted set operations fail
- **TTL cleanup** automatically removes old events
- Zero-padded sequence numbers ensure **lexicographic ordering**

### 3. Ordered Event History (`streamKey`)
**Pattern**: `message-stream-<chat-id>:stream`
**APIs**: 
- `redis.zadd(streamKey, nextSeq, JSON.stringify(event))`
- `redis.zcard(streamKey)` 
- `redis.zrange(streamKey, 0, -1)`

```typescript
const streamKey = `${streamName}:stream`;
await redis.zadd(streamKey, nextSeq, JSON.stringify(event));
await redis.expire(streamKey, 3600);

// For history replay:
const events = await redis.zrange(streamKey, 0, -1);
```

**Purpose**:
- **Sorted Set** maintains events in **chronological order** by sequence number
- Enables **history replay** when users reconnect/refresh
- `ZRANGE` retrieves all historical events in order
- `ZCARD` counts total events for metrics
- This is the **key to resumability** - new connections can replay missed events

### 4. Real-time Pub/Sub (`channelKey`)
**Pattern**: `message-stream-<chat-id>:channel`
**API**: `redis.publish(channelKey, JSON.stringify(event))`

```typescript
const channelKey = `${streamName}:channel`;
await redis.publish(channelKey, JSON.stringify(event));
```

**Purpose**:
- Provides **real-time delivery** to currently connected clients
- **Fire-and-forget** messaging for live subscribers
- Works independently of persistent storage
- Handles the "live streaming" part while sorted sets handle "catch-up"

## How Resumable Streaming Works

### 1. **Event Production Flow**
```
User Message → [INCR seq] → [SETEX event] → [ZADD stream] → [PUBLISH channel]
                    ↓              ↓             ↓              ↓
              Get next seq    Store event   Add to history   Notify live clients
```

### 2. **Client Connection/Reconnection Flow**
```
Client Connects → [ZRANGE stream] → Replay History → [SUBSCRIBE channel] → Receive Live Events
                        ↓                ↓                    ↓
                  Get all past      Send missed events    Listen for new events
```

### 3. **Why This Enables Resumability**

**Page Refresh**: 
- Client reconnects and calls `subscribeToMessageChunkStream(chatId)`
- Function first calls `redis.zrange(streamKey, 0, -1)` to get **all historical events**
- Client receives all missed chunks in correct order
- Then subscribes to pub/sub for new events

**Different Device**:
- Same `chatId` is used across devices
- New device gets same historical events from sorted set
- Can continue from where other device left off

**Network Interruption**:
- Events continue being stored in Redis even if client disconnects
- When client reconnects, it gets all events that happened during disconnection

## Key Design Decisions

### **Atomic Sequence Generation**
```typescript
const nextSeq = (await redis.incr(seqKey)) - 1;
```
- **Thread-safe** sequence generation
- **No race conditions** even with multiple servers
- Guarantees **unique ordering** across all events

### **Dual Storage Strategy**
- **Sorted Set** (`streamKey`) for **ordered history replay**
- **Individual Keys** (`eventKey`) for **direct event access**
- **Pub/Sub** (`channelKey`) for **real-time delivery**
- **Redundancy** ensures reliability

### **TTL-based Cleanup**
```typescript
await redis.expire(streamKey, 3600); // 1 hour
await redis.setex(eventKey, 3600, JSON.stringify(event)); // 1 hour
```
- **Automatic cleanup** prevents Redis memory bloat
- **Configurable retention** period
- **No manual cleanup** required

### **Stateless Design**
- **No server-side state** about client connections
- **Cluster-friendly** - any server can handle any client
- **Redis holds all state** - servers are just processors

## Stream Lifecycle

1. **Stream Start**: `startMessageChunkStream()` creates producer
2. **Event Generation**: Producer creates events with incremental sequence numbers
3. **Storage**: Each event stored in 3 places (individual key, sorted set, pub/sub)
4. **Client Subscription**: Clients get history + live events
5. **Stream Complete**: `aiMessageComplete` event marks end
6. **Cleanup**: TTL automatically removes old data

This architecture ensures that **message streaming is resumable, multi-device compatible, and fault-tolerant** while maintaining **real-time performance** for live clients.