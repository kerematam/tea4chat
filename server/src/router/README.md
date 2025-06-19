# Streaming Routers

This directory contains two different approaches to implementing resumable streaming with Redis:

## Available Routers

### 1. `streamRouter.ts` - Traditional State Accumulation
- **Approach**: Stores full accumulated content in Redis
- **Use Case**: Simple streaming scenarios
- **Pros**: Straightforward implementation
- **Cons**: Growing memory usage, limited resume granularity

### 2. `streamRouter.event-sourced.ts` - Event Sourcing ⭐ **Recommended**
- **Approach**: Stores individual events using Redis Streams
- **Use Case**: Production-grade resumable streaming
- **Pros**: Constant-size writes, perfect resume capability, scalable
- **Cons**: Slightly more complex implementation

## Quick Comparison

| Feature | Traditional | Event Sourcing |
|---------|-------------|----------------|
| **Memory Usage** | O(n) growing | O(1) constant |
| **Resume Granularity** | Full content only | Any event position |
| **Write Performance** | Degrades over time | Consistent |
| **Storage Efficiency** | Low (duplicated content) | High (individual chunks) |
| **Production Ready** | Basic scenarios | ✅ Enterprise ready |

## Documentation

📖 **[Complete Event Sourcing Documentation](../../../docs/event-sourcing-streams.md)**

The documentation covers:
- Architecture and core concepts
- API endpoints and usage
- TTL management and cleanup strategies
- Client integration examples
- Performance benefits and best practices
- Monitoring and debugging techniques

## Quick Start

### Event Sourcing Router (Recommended)

```typescript
// Start a stream
const result = await trpc.streamEventSourced.manageStream.mutate({
  streamId: "my-stream",
  action: "start",
  intervalMs: 500
});

// Listen to stream (resumable)
const streamGenerator = await trpc.streamEventSourced.listenToStream.mutate({
  streamId: "my-stream",
  fromEventId: "0" // Or specific event ID for resume
});

for await (const event of streamGenerator) {
  if (event.type === 'chunk') {
    accumulatedContent += event.content;
    displayContent(accumulatedContent);
  }
}

// Load complete saved content
const data = await trpc.streamEventSourced.getStreamContent.query({
  streamId: "my-stream"
});
```

### Test UI

Both approaches have test UIs available:
- Traditional: `/stream-test`
- Event Sourcing: `/stream-test-event-sourced`

## Key Benefits of Event Sourcing

1. **Perfect Resume**: Resume from any point using event IDs
2. **Constant Performance**: O(1) writes regardless of stream length
3. **Memory Efficient**: Only stores individual chunks, not accumulated state
4. **Production Ready**: Unified TTL management, smart cleanup, error handling
5. **Debuggable**: Full event history and TTL monitoring capabilities

## Implementation Notes

- **TTL Management**: Unified expiration prevents orphaned data
- **Smart Recreation**: Automatic cleanup of completed streams
- **Ongoing Streams Only**: `listenToStream` only serves active streams
- **Event Types**: `start`, `chunk`, `complete` events with proper typing
- **Error Recovery**: Graceful handling of network interruptions and timeouts

For detailed implementation details, architecture diagrams, and best practices, see the [full documentation](../../../docs/event-sourcing-streams.md). 