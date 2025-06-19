# Tea4Chat Documentation

## Streaming System Documentation

### 📖 [Event-Sourced Streaming Guide](./event-sourcing-streams.md)
**Complete documentation for the Redis Event-Sourced Streaming system**

This is the main documentation covering:
- Architecture and core concepts
- API endpoints and usage patterns
- TTL management and cleanup strategies
- Client integration examples
- Performance benefits and best practices
- Monitoring and debugging techniques
- Complete code examples

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
  if (event.type === 'chunk') {
    content += event.content;
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