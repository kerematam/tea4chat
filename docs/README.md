# Tea4Chat Documentation

## Streaming System Documentation

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
- **`server/src/router/streamRouter.event-sourced.ts`** - Main tRPC router with event sourcing
- **`server/src/lib/redis.event-sourcing.ts`** - Redis helpers and event sourcing logic
- **`server/src/router/streamRouter.ts`** - Traditional state-accumulation router (for comparison)

### Frontend Implementation  
- **`ui/src/pages/StreamTest/StreamTestEventSourced.tsx`** - Event sourcing test UI
- **`ui/src/pages/StreamTest/StreamTest.tsx`** - Traditional streaming test UI

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client UI     │    │   tRPC Router    │    │  Redis Streams  │
│                 │    │                  │    │                 │
│ - Start/Stop    │◄──►│ - manageStream   │◄──►│ - Events Store  │
│ - Listen/Resume │    │ - listenToStream │    │ - Pub/Sub       │
│ - Load Content  │    │ - getContent     │    │ - TTL Management│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

```typescript
// Start streaming
await trpc.streamEventSourced.manageStream.mutate({
  streamId: "my-stream",
  action: "start",
  intervalMs: 500
});

// Listen with resume capability
const streamGenerator = await trpc.streamEventSourced.listenToStream.mutate({
  streamId: "my-stream",
  fromEventId: "0" // Or specific event ID
});

for await (const event of streamGenerator) {
  if (event.type === 'chunk' && event.data?.content) {
    content += event.data.content;
  }
}
```

## Key Benefits

✅ **Perfect Resume**: Resume from any point using event IDs  
✅ **Constant Performance**: O(1) writes regardless of stream length  
✅ **Memory Efficient**: Only stores individual chunks, not accumulated state  
✅ **Production Ready**: Unified TTL management, smart cleanup, error handling  
✅ **Debuggable**: Full event history and TTL monitoring capabilities  

## Test URLs

- **Event Sourcing Test**: `http://localhost:3000/stream-test-event-sourced`
- **Traditional Test**: `http://localhost:3000/stream-test`

For detailed implementation details, see the [complete documentation](./event-sourcing-streams.md). 