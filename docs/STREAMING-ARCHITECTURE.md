# Tea4Chat Documentation

## Overview

Tea4Chat is a real-time chat application with AI capabilities, featuring a sophisticated dual-mechanism streaming system that provides both high-performance direct streaming and resilient resumable streams.

## Streaming Architecture

### Hybrid Streaming System

Tea4Chat implements a sophisticated hybrid streaming system that combines real-time direct streaming with resumable Redis-based streaming for optimal performance and reliability.

#### Core Flow

**Page Visit & Resumption Flow:**
```
User visits chat page
       ↓
1. Fetch existing messages (trpc.message.getMessages - infinite query)
       ↓
2. Check if streaming message exists in response
       ↓
   ┌─── Yes: Ongoing stream detected ───┐
   │                                    │
   │ 3. Start Redis stream listening    │
   │    (trpc.message.listenToMessageChunkStream)
   │    • Slower but resumable          │
   │    • Throttled (1s intervals)      │
   │                                    │
   └────────────────────────────────────┘
```

**New Message Flow:**
```
User sends new message
       ↓
Direct streaming (trpc.message.sendWithStream)
   • Fast, real-time response
   • SSE chunks via synchronous request
   • No Redis reads needed
```

#### Three Key Mechanisms

**1. Message History (trpc.message.getMessages)**
- Bi-directional infinite query with pagination
- Loads previous messages and detects ongoing streams
- Returns `streamingMessage` if a stream is currently active
- Triggers Redis stream listening for resumption

**2. Direct Streaming (trpc.message.sendWithStream)**
- **Primary method** for new user messages
- Synchronous request with SSE response chunks
- Fastest possible streaming (direct from AI provider)
- No Redis reads needed (writes still occur for other clients)
- Used when user initiates the conversation

**3. Redis Stream Fallback (trpc.message.listenToMessageChunkStream)**
- **Fallback method** for connection recovery scenarios
- Used when user visits page with ongoing stream (different device, page reload)
- Reads from Redis Streams with throttled updates (1-second intervals)
- Enables perfect stream resumption
- Resource-efficient (limited Redis writes)

#### When Each Method Is Used

**Direct Streaming** (Primary - ~95% of cases):
```typescript
// User sends message → immediate fast streaming
trpc.message.sendWithStream.mutate({
  content: "Hello",
  chatId: "123"
})
// → SSE chunks stream directly back
```

**Redis Stream Resumption** (Recovery scenarios):
```typescript
// User visits page → detects ongoing stream
const messages = await trpc.message.getMessages.query({ chatId: "123" })
if (messages.streamingMessage) {
  // → Start listening to Redis stream for resumption
  trpc.message.listenToMessageChunkStream.mutate({
    chatId: "123",
    fromTimestamp: messages.syncDate
  })
}
```

### Resource Optimization Strategy

- **Redis reads are minimized**: Direct streaming avoids Redis reads for maximum speed
- **Background Redis writes**: Data still written to Redis (throttled to 1-second intervals) for other clients
- **On-demand resumption**: Redis streams only read when needed (page reload, device switch)
- **Bi-directional pagination**: Efficient loading of message history with caching

---

## Experimental & Legacy Features

The following features were experimental implementations or legacy systems that are not part of the current production architecture:

### 🎯 [StreamController System](./stream-controller.md)
**High-level type-safe streaming interface - START HERE**

The recommended way to work with streams:
- Type-safe generic interface with full TypeScript support
- Self-contained lifecycle management (push, stop, complete)
- Smart stream initialization and recreation logic
- Comprehensive usage patterns and real-world examples
- Best practices and error handling patterns

### 📖 [Event-Sourced Streaming Guide](./event-sourcing-streams.md)
**Lower-level Redis implementation details**

Deep dive into the underlying implementation:
- Redis Streams architecture and internals
- TTL management and cleanup strategies
- Performance benefits and comparisons
- Advanced monitoring and debugging techniques
- Direct Redis integration examples

### 🛑 [Stream Abort Mechanism](./stream-abort-mechanism.md)
**User-initiated stream termination and error handling**

Comprehensive guide covering:
- Graceful stream termination without error messages
- Type-safe abort detection and error handling
- Server-side abort registry and cleanup
- UI integration with stop button functionality
- Best practices and testing strategies

### 🚀 [Router Quick Start](../server/src/router/README.md)
**Quick comparison and getting started guide**

Covers:
- Traditional vs Event Sourcing comparison
- Quick start code examples
- Available test UIs
- Key benefits overview

## Key Files

### Backend Implementation
- **`server/src/router/messageRouter.ts`** - Main message routing with hybrid streaming mechanism
  - `sendWithStream` - Direct streaming mutation
  - `listenToMessageChunkStream` - Redis stream fallback
  - `getMessages` - Message history with streaming detection
- **`server/src/lib/redis-message/`** - Redis message streaming implementation

### Experimental Backend (Not in Production)
- **`server/src/router/streamRouter.event-sourced.ts`** - Event-sourced streaming router (experimental)
- **`server/src/lib/redis.event-sourcing.ts`** - Redis helpers and event sourcing logic (experimental)

### Frontend Implementation  
- **`ui/src/hooks/useChatMessages/useChatMessages.ts`** - Main hook coordinating all streaming mechanisms
- **`ui/src/hooks/useChatMessages/useChatStreaming.ts`** - TRPC mutation management for streaming
- **`ui/src/hooks/useChatMessages/streamingStore.ts`** - Zustand store for streaming state
- **`ui/src/hooks/useChatMessages/useSyncMessages.ts`** - Message synchronization logic
- **`ui/src/pages/StreamTest/`** - Various streaming test UIs

## Test URLs

- **Main Chat Interface**: `http://localhost:3000/` - Production chat interface

### Experimental Test URLs (Not Production)
- **Event Sourcing Test**: `http://localhost:3000/stream-test-event-sourced` (experimental)
- **Traditional Test**: `http://localhost:3000/stream-test` (experimental)