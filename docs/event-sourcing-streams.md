# Redis Event-Sourced Streaming Documentation

## Overview

The Redis Event-Sourced Streaming system provides resumable, efficient streaming capabilities using Redis Streams as the underlying storage mechanism. Unlike traditional state-accumulation approaches, this system stores each chunk as a separate event, enabling perfect resume functionality and constant-size writes.

## Architecture

### Core Concepts

**Event Sourcing**: Instead of storing accumulated state, each stream chunk is stored as an individual event in Redis Streams. The complete stream content is reconstructed by replaying all events when needed.

**Resumable Streams**: Clients can resume listening from any point using event IDs, making streams resilient to network interruptions and page refreshes.

**Unified TTL Management**: Both metadata and stream events expire together, preventing orphaned data.

### Key Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client UI     │    │   tRPC Router    │    │  Redis Streams  │
│                 │    │                  │    │                 │
│ - Start/Stop    │◄──►│ - manageStream   │◄──►│ - Events Store  │
│ - Listen/Resume │    │ - listenToStream │    │ - Pub/Sub       │
│ - Load Content  │    │ - getContent     │    │ - TTL Management│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Redis Data Structure

### Stream Events Key
```
stream:events:{streamId}
```
Stores individual events using Redis Streams (`XADD`):
- `start` events: Stream initialization
- `chunk` events: Individual content pieces  
- `complete` events: Stream completion with metadata

### Stream Metadata Key
```
stream:meta:{streamId}
```
Stores stream metadata as JSON:
```json
{
  "streamId": "stream-abc123",
  "status": "active|completed", 
  "startedAt": "2024-01-01T10:00:00Z",
  "lastActivity": "2024-01-01T10:05:00Z",
  "type": "demo",
  "ownerId": "user123"
}
```

### Pub/Sub Channel
```
stream:channel:{streamId}
```
Real-time event notifications for active listeners.

## API Endpoints

### 1. `manageStream`
**Purpose**: Start or stop streaming sessions

**Input**:
```typescript
{
  streamId: string;
  action: "start" | "stop";
  intervalMs: number;
}
```

**Behavior**:
- **Start**: Creates new stream, begins chunk generation
- **Stop**: Completes stream, cleans up resources
- **Smart Recreation**: Automatically cleans up completed streams before recreation

**Stream Creation Logic**:
```typescript
// Check existing stream
const existingMeta = await streamHelpers.getStreamMeta(streamId);
if (existingMeta) {
  const events = await streamHelpers.getStreamEvents(streamId);
  const lastEvent = events[events.length - 1];
  
  if (lastEvent?.type === 'complete') {
    // Clean up completed stream before recreation
    await streamHelpers.cleanup.deleteStream(streamId);
  } else {
    // Check if stream is stale (STALE_STREAM_TIMEOUT = 5s)
    // Throw error if still active
  }
}
```

### 2. `listenToStream`
**Purpose**: Listen to ongoing streams only (not completed ones)

**Input**:
```typescript
{
  streamId: string;
  fromEventId?: string; // For resuming from specific point
}
```

**Behavior**:
- **Completed Streams**: Returns nothing (no events yielded)
- **Ongoing Streams**: Yields past events + real-time events
- **Resume Capability**: Start from specific event ID

**Event Processing**:
```typescript
// Step 1: Check if stream is completed
if (streamMeta.status === 'completed') {
  return; // Don't yield anything
}

// Step 2: Yield past events (excluding completion events)
for (const event of pastEvents) {
  if (event.type === 'complete') {
    return; // Stop if completion found
  }
  yield event; // Only yield start/chunk events
}

// Step 3: Subscribe to real-time events
// Stop yielding if completion/error arrives
```

### 3. `getStreamContent`
**Purpose**: Get complete stream data built from events

**Input**:
```typescript
{
  streamId: string;
}
```

**Output**:
```typescript
{
  streamId: string;
  content: string;        // Full accumulated content
  chunks: number;         // Number of chunk events
  eventCount: number;     // Total events
  meta: StreamMetadata;   // Stream metadata
  events: Event[];        // All events with IDs
}
```

## TTL Management

### TTL Constants
```typescript
export const STREAM_TTL = 10;              // 10 seconds - active streams
export const STREAM_TIMEOUT = 10;          // 10 seconds - general timeout  
export const STALE_STREAM_TIMEOUT = 5;     // 5 seconds - stale stream check
```

### Unified Expiration Strategy
Both metadata and stream events expire together:

```typescript
// On stream creation
await redis.setex(metaKey, STREAM_TTL, JSON.stringify(metadata));
await redis.expire(streamKey, STREAM_TTL);

// On each chunk addition  
await redis.setex(metaKey, STREAM_TTL, JSON.stringify(metadata));
await redis.expire(streamKey, STREAM_TTL); // Reset both TTLs together
```

**Benefits**:
- No orphaned data (metadata without events or vice versa)
- Predictable cleanup behavior
- Consistent state across Redis keys

## Event Types

### Start Event
```json
{
  "type": "start",
  "streamId": "stream-abc123", 
  "timestamp": "2024-01-01T10:00:00Z"
}
```
*Note: No `fullContent` field - content is accumulated incrementally on the client side from chunk events.*

### Chunk Event  
```json
{
  "type": "chunk",
  "streamId": "stream-abc123",
  "data": {
    "content": "Hello world! "
  },
  "timestamp": "2024-01-01T10:00:01Z"
}
```
*Note: The `data` object structure allows for future message properties like `messageId`, `userId`, etc.*

### Complete Event
```json
{
  "type": "complete", 
  "streamId": "stream-abc123",
  "timestamp": "2024-01-01T10:05:00Z",
  "data": {
    "totalChunks": 50,
    "reason": "auto-completed"
  }
}
```

## Smart Recreation Logic

When starting a stream with an existing ID:

```typescript
if (lastEvent?.type === 'complete') {
  // Stream completed - clean up and allow immediate recreation
  await streamHelpers.cleanup.deleteStream(streamId);
  // Proceed with new stream
} else {
  // Stream incomplete - check staleness
  const timeSinceLastActivity = Date.now() - new Date(lastActivity).getTime();
  if (timeSinceLastActivity < STALE_STREAM_TIMEOUT * 1000) {
    throw new TRPCError({ code: "CONFLICT", message: "Stream still active" });
  }
  // Stale stream - allow recreation
}
```

## Performance Benefits

### Constant-Size Writes
- **Traditional**: Each chunk requires reading existing content + appending + rewriting (O(n) growth)
- **Event Sourcing**: Each chunk is independent write (O(1) constant size)

### Memory Efficiency  
- **Traditional**: Full content stored in Redis, grows with each chunk
- **Event Sourcing**: Only individual chunks stored, content built on-demand

### Resume Performance
- **Traditional**: Must store full content to resume
- **Event Sourcing**: Replay from any event ID, perfect granularity

## Client Integration

### Starting a Stream
```typescript
const result = await trpc.streamEventSourced.manageStream.mutate({
  streamId: "my-stream",
  action: "start", 
  intervalMs: 500
});
```

### Listening to Stream
```typescript
const streamGenerator = await trpc.streamEventSourced.listenToStream.mutate({
  streamId: "my-stream",
  fromEventId: "0" // Start from beginning
});

let accumulatedContent = '';
for await (const event of streamGenerator) {
  if (event.type === 'start') {
    // Reset content on stream start
    accumulatedContent = '';
  } else if (event.type === 'chunk' && event.data?.content) {
    // Accumulate content incrementally on client side
    accumulatedContent += event.data.content;
    displayContent(accumulatedContent);
  }
}
```

### Resuming from Specific Point
```typescript
const streamGenerator = await trpc.streamEventSourced.listenToStream.mutate({
  streamId: "my-stream", 
  fromEventId: "1640995200000-0" // Resume from specific event
});
```

### Loading Saved Content
```typescript
const data = await trpc.streamEventSourced.getStreamContent.query({
  streamId: "my-stream"
});

console.log(`Stream has ${data.eventCount} events`);
console.log(`Content: ${data.content}`);
```

## Error Handling

### Stream Not Found
```typescript
// listenToStream returns nothing (no events)
let hasEvents = false;
for await (const event of streamGenerator) {
  hasEvents = true;
  // Process event
}
if (!hasEvents) {
  console.log("Stream not found or completed");
}
```

### Network Interruption
```typescript
// Client can resume from last received event
const lastEventId = getLastProcessedEventId();
const streamGenerator = await trpc.streamEventSourced.listenToStream.mutate({
  streamId: "my-stream",
  fromEventId: lastEventId
});
```

## Monitoring & Debugging

### TTL Information
```typescript
const ttlInfo = await trpc.streamEventSourced.getStreamTTL.query({
  streamId: "my-stream"
});

console.log(`Stream TTL: ${ttlInfo.streamTTL}`);
console.log(`Meta TTL: ${ttlInfo.metaTTL}`); 
console.log(`Synchronized: ${ttlInfo.synchronized}`);
```

### Active Streams
```typescript
const stats = await trpc.streamEventSourced.getActiveStreams.query();
console.log(`Active streams in memory: ${stats.inMemoryCount}`);
```

## Best Practices

### 1. TTL Configuration
- Keep `STALE_STREAM_TIMEOUT < STREAM_TTL` to prevent conflicts
- Adjust TTL based on expected stream duration and resume requirements

### 2. Event ID Management
- Store last processed event ID on client for resume capability
- Use event IDs for precise resume positioning

### 3. Cleanup Strategy
- Rely on Redis TTL for automatic cleanup
- Manual cleanup only for completed streams during recreation

### 4. Error Recovery
- Always handle empty stream generators (completed/not found streams)
- Implement exponential backoff for connection retries

### 5. Content Reconstruction
- Build content incrementally on client side for better performance
- Use `getStreamContent` only when full reconstruction is needed

## Comparison: Traditional vs Event Sourcing

| Aspect | Traditional | Event Sourcing |
|--------|-------------|----------------|
| **Storage** | Accumulated state | Individual events |
| **Write Size** | Growing (O(n)) | Constant (O(1)) |
| **Resume** | Full content only | Any event position |
| **Memory** | High (full content) | Low (event chunks) |
| **Cleanup** | TTL expiration | TTL + smart cleanup |
| **Scalability** | Limited by content size | Scales with event count |

## Implementation Files

- **Router**: `server/src/router/streamRouter.event-sourced.ts`
- **Helpers**: `server/src/lib/redis.event-sourcing.ts` 
- **UI Component**: `ui/src/pages/StreamTest/StreamTestEventSourced.tsx`
- **Types**: Shared between client and server via tRPC

This event-sourcing approach provides a robust, scalable foundation for resumable streaming in production applications. 