# StreamController Documentation

The StreamController system provides a powerful, type-safe, and self-contained interface for managing Redis-based event-sourced streams in your application.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Type Safety](#type-safety)
- [Usage Patterns](#usage-patterns)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The StreamController is a high-level abstraction that encapsulates all stream operations into a single, easy-to-use interface. It handles:

- Stream initialization with smart recreation logic
- Type-safe data pushing
- Automatic cleanup and lifecycle management
- Stream stopping and completion
- Redis event sourcing under the hood

## Key Features

### ✨ **Type-Safe Generic Interface**
```typescript
interface ChatMessage {
  content: string;
  userId: string;
  messageType: 'text' | 'image' | 'file';
}

const controller = await initializeStream<ChatMessage>({...});
// Now all operations are type-safe for ChatMessage
```

### 🎯 **Self-Contained Lifecycle Management**
```typescript
const controller = await initializeStream<MyData>({...});

await controller.push(data);      // Add data
await controller.stop("reason");  // Stop stream
await controller.complete(meta);  // Complete stream
```

### 🔄 **Smart Stream Recreation**
- Automatically handles existing streams
- Cleans up completed streams before recreation
- Validates timeout for incomplete streams
- Provides detailed initialization feedback

### 🛡️ **Automatic Cleanup**
- Handles Redis connections
- Manages interval timers
- Cleans up memory references
- Ensures no resource leaks

## Quick Start

### 1. Define Your Data Type
```typescript
interface OrderUpdate {
  orderId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  timestamp: string;
  metadata?: {
    trackingNumber?: string;
    estimatedDelivery?: string;
  };
}
```

### 2. Initialize Stream
```typescript
import { initializeStream } from '../lib/stream-initializer.js';

const orderController = await initializeStream<OrderUpdate>({
  streamId: 'order-12345',
  streamConfig: {
    type: 'order-tracking',
    intervalMs: 1000,
    ownerId: 'user-456'
  },
  staleTimeoutSeconds: 30
});
```

### 3. Use the Controller
```typescript
// Push updates
await orderController.push({
  orderId: 'order-12345',
  status: 'processing',
  timestamp: new Date().toISOString()
});

await orderController.push({
  orderId: 'order-12345',
  status: 'shipped',
  timestamp: new Date().toISOString(),
  metadata: {
    trackingNumber: 'TRK123456',
    estimatedDelivery: '2024-01-15'
  }
});

// Complete the stream
await orderController.complete({
  totalUpdates: 3,
  finalStatus: 'delivered'
});
```

## API Reference

### `initializeStream<T>(options)`

Creates and initializes a new StreamController with type safety.

**Parameters:**
- `options: StreamInitializationOptions` - Configuration object

**Returns:** `Promise<StreamController<T>>` - Type-safe stream controller

**Options:**
```typescript
interface StreamInitializationOptions {
  streamId: string;
  streamConfig: {
    type: string;
    intervalMs: number;
    ownerId?: string;
  };
  staleTimeoutSeconds: number;
}
```

### `StreamController<T>` Interface

#### `push(data: T): Promise<Result>`
Pushes typed data to the stream.

```typescript
const result = await controller.push({
  content: "Hello world!",
  userId: "user-123"
});
// result: { eventId: string | null, timestamp: string } | null
```

#### `stop(reason?: string): Promise<Result>`
Stops the stream with optional reason.

```typescript
await controller.stop("user-cancelled");
// Handles cleanup automatically
```

#### `complete(metadata?: object): Promise<Result>`
Completes the stream with optional metadata.

```typescript
await controller.complete({
  totalEvents: 150,
  duration: "5m 23s",
  reason: "success"
});
```

#### `getMeta(): Promise<any>`
Gets current stream metadata.

```typescript
const meta = await controller.getMeta();
console.log(meta.status, meta.startedAt);
```

#### `getEvents(fromId?: string): Promise<any[]>`
Gets stream events, optionally from a specific event ID.

```typescript
const allEvents = await controller.getEvents();
const recentEvents = await controller.getEvents("1234567890-5");
```

#### `setStopCallback(callback: StreamStopCallback): void`
Sets custom stop behavior (usually handled internally).

## Type Safety

### Generic Type Parameter
The StreamController accepts a generic type parameter that enforces the shape of data you can push:

```typescript
interface BlogPost {
  title: string;
  content: string;
  authorId: string;
  tags: string[];
  publishedAt?: string;
}

const blogController = await initializeStream<BlogPost>({...});

// ✅ Valid - matches BlogPost interface
await blogController.push({
  title: "My Blog Post",
  content: "This is the content...",
  authorId: "author-123",
  tags: ["tech", "typescript"]
});

// ❌ TypeScript error - missing required fields
await blogController.push({
  title: "Incomplete Post"
  // Missing content, authorId, tags
});

// ❌ TypeScript error - wrong field type
await blogController.push({
  title: "My Post",
  content: "Content...",
  authorId: "author-123",
  tags: "should-be-array" // Wrong type!
});
```

### Runtime Safety
Even with TypeScript, the system provides runtime safety:

- JSON serialization/deserialization
- Redis connection error handling
- Stream expiration detection
- Automatic cleanup on errors

## Usage Patterns

### 1. **Real-time Data Streaming**
```typescript
interface SensorReading {
  sensorId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

const sensorController = await initializeStream<SensorReading>({
  streamId: `sensor-${sensorId}`,
  streamConfig: { type: 'sensor-data', intervalMs: 1000 },
  staleTimeoutSeconds: 60
});

// Stream sensor data
setInterval(async () => {
  await sensorController.push({
    sensorId: 'TEMP001',
    temperature: Math.random() * 30 + 10,
    humidity: Math.random() * 100,
    timestamp: new Date().toISOString()
  });
}, 5000);
```

### 2. **Chat Message Streaming**
```typescript
interface ChatMessage {
  messageId: string;
  content: string;
  userId: string;
  roomId: string;
  messageType: 'text' | 'image' | 'file';
  timestamp: string;
  metadata?: {
    replyTo?: string;
    edited?: boolean;
    reactions?: string[];
  };
}

const chatController = await initializeStream<ChatMessage>({
  streamId: `chat-${roomId}`,
  streamConfig: { type: 'chat', intervalMs: 100 },
  staleTimeoutSeconds: 300
});

// Send messages
await chatController.push({
  messageId: 'msg-123',
  content: 'Hello everyone!',
  userId: 'user-456',
  roomId: 'room-789',
  messageType: 'text',
  timestamp: new Date().toISOString()
});
```

### 3. **Progress Tracking**
```typescript
interface ProgressUpdate {
  taskId: string;
  stage: string;
  progress: number; // 0-100
  message: string;
  timestamp: string;
  details?: object;
}

const progressController = await initializeStream<ProgressUpdate>({
  streamId: `task-${taskId}`,
  streamConfig: { type: 'progress', intervalMs: 500 },
  staleTimeoutSeconds: 120
});

// Track progress
for (let i = 0; i <= 100; i += 10) {
  await progressController.push({
    taskId: 'task-abc',
    stage: 'processing',
    progress: i,
    message: `Processing... ${i}%`,
    timestamp: new Date().toISOString()
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}

await progressController.complete({ 
  success: true,
  duration: '10s'
});
```

### 4. **Error Handling Pattern**
```typescript
const controller = await initializeStream<MyDataType>({...});

try {
  // Your streaming logic
  await controller.push(data1);
  await controller.push(data2);
  
  // Simulate some processing
  await processData();
  
  // Normal completion
  await controller.complete({ success: true });
  
} catch (error) {
  console.error('Stream error:', error);
  
  // Stop with error reason
  await controller.stop(`error: ${error.message}`);
  
  // Or complete with error metadata
  await controller.complete({
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  });
}
```

## Best Practices

### 1. **Define Clear Data Types**
```typescript
// ✅ Good - Clear, specific interface
interface UserActivity {
  userId: string;
  action: 'login' | 'logout' | 'page_view' | 'click';
  timestamp: string;
  metadata: {
    page?: string;
    element?: string;
    sessionId: string;
  };
}

// ❌ Avoid - Too generic
interface GenericEvent {
  type: string;
  data: any;
}
```

### 2. **Use Meaningful Stream IDs**
```typescript
// ✅ Good - Descriptive and unique
const streamId = `user-activity-${userId}-${sessionId}`;
const streamId = `order-updates-${orderId}`;
const streamId = `chat-room-${roomId}-${Date.now()}`;

// ❌ Avoid - Generic or unclear
const streamId = `stream-123`;
const streamId = `data`;
```

### 3. **Handle Errors Gracefully**
```typescript
async function createUserStream(userId: string) {
  try {
    const controller = await initializeStream<UserEvent>({
      streamId: `user-${userId}`,
      streamConfig: { type: 'user-events', intervalMs: 1000 },
      staleTimeoutSeconds: 60
    });
    
    return controller;
  } catch (error) {
    if (error.code === 'CONFLICT') {
      console.log('Stream already exists, waiting...');
      // Retry logic or return existing stream
    } else {
      console.error('Failed to create stream:', error);
      throw error;
    }
  }
}
```

### 4. **Use Appropriate Timeouts**
```typescript
// Real-time chat - short timeout
const chatController = await initializeStream<ChatMessage>({
  streamId: `chat-${roomId}`,
  staleTimeoutSeconds: 30  // 30 seconds
});

// Long-running process - longer timeout
const processController = await initializeStream<ProcessUpdate>({
  streamId: `process-${jobId}`,
  staleTimeoutSeconds: 300  // 5 minutes
});
```

### 5. **Clean Resource Management**
```typescript
class StreamManager {
  private controllers = new Map<string, StreamController<any>>();
  
  async createStream<T>(streamId: string, config: any): Promise<StreamController<T>> {
    const controller = await initializeStream<T>(config);
    this.controllers.set(streamId, controller);
    return controller;
  }
  
  async stopAllStreams() {
    for (const [streamId, controller] of this.controllers) {
      try {
        await controller.stop('shutdown');
      } catch (error) {
        console.error(`Error stopping stream ${streamId}:`, error);
      }
    }
    this.controllers.clear();
  }
}
```

## Examples

### Complete Chat Application Stream
```typescript
interface ChatMessage {
  id: string;
  content: string;
  userId: string;
  username: string;
  roomId: string;
  timestamp: string;
  type: 'message' | 'join' | 'leave' | 'typing';
  metadata?: {
    replyTo?: string;
    edited?: boolean;
    reactions?: Array<{ emoji: string; userId: string }>;
  };
}

class ChatRoom {
  private streamController: StreamController<ChatMessage>;
  
  constructor(private roomId: string) {}
  
  async initialize() {
    this.streamController = await initializeStream<ChatMessage>({
      streamId: `chat-${this.roomId}`,
      streamConfig: {
        type: 'chat-room',
        intervalMs: 100,
        ownerId: this.roomId
      },
      staleTimeoutSeconds: 300
    });
  }
  
  async sendMessage(userId: string, username: string, content: string) {
    await this.streamController.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      content,
      userId,
      username,
      roomId: this.roomId,
      timestamp: new Date().toISOString(),
      type: 'message'
    });
  }
  
  async userJoined(userId: string, username: string) {
    await this.streamController.push({
      id: `join-${Date.now()}`,
      content: `${username} joined the room`,
      userId,
      username,
      roomId: this.roomId,
      timestamp: new Date().toISOString(),
      type: 'join'
    });
  }
  
  async closeRoom() {
    await this.streamController.complete({
      reason: 'room-closed',
      timestamp: new Date().toISOString()
    });
  }
}
```

### File Upload Progress Stream
```typescript
interface UploadProgress {
  fileId: string;
  filename: string;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  speed: number; // bytes per second
  timeRemaining: number; // seconds
  stage: 'uploading' | 'processing' | 'complete' | 'error';
  timestamp: string;
}

class FileUploadStream {
  private controller: StreamController<UploadProgress>;
  
  constructor(private fileId: string, private filename: string, private totalSize: number) {}
  
  async start() {
    this.controller = await initializeStream<UploadProgress>({
      streamId: `upload-${this.fileId}`,
      streamConfig: {
        type: 'file-upload',
        intervalMs: 500,
        ownerId: this.fileId
      },
      staleTimeoutSeconds: 600 // 10 minutes
    });
    
    // Initial progress
    await this.updateProgress(0, 'uploading');
  }
  
  async updateProgress(uploadedSize: number, stage: UploadProgress['stage']) {
    const progress = Math.round((uploadedSize / this.totalSize) * 100);
    const speed = this.calculateSpeed(uploadedSize);
    const timeRemaining = this.calculateTimeRemaining(uploadedSize, speed);
    
    await this.controller.push({
      fileId: this.fileId,
      filename: this.filename,
      totalSize: this.totalSize,
      uploadedSize,
      progress,
      speed,
      timeRemaining,
      stage,
      timestamp: new Date().toISOString()
    });
  }
  
  async complete() {
    await this.controller.complete({
      fileId: this.fileId,
      filename: this.filename,
      success: true,
      finalSize: this.totalSize,
      completedAt: new Date().toISOString()
    });
  }
  
  async error(errorMessage: string) {
    await this.controller.stop(`upload-error: ${errorMessage}`);
  }
  
  private calculateSpeed(uploadedSize: number): number {
    // Implementation details...
    return 0;
  }
  
  private calculateTimeRemaining(uploadedSize: number, speed: number): number {
    // Implementation details...
    return 0;
  }
}
```

---

## Related Documentation

- [Event Sourcing Streams](./event-sourcing-streams.md) - Lower-level Redis implementation
- [Stream Listener Utility](../server/src/lib/stream-listener.ts) - Client-side listening
- [Router Implementation](../server/src/router/streamRouter.event-sourced.ts) - tRPC integration

## Contributing

When extending the StreamController system:

1. Maintain type safety with generics
2. Ensure proper cleanup in all code paths
3. Add comprehensive error handling
4. Update documentation with new features
5. Include usage examples

The StreamController system is designed to be the primary interface for all streaming operations in the application. It provides a clean, type-safe, and powerful abstraction over the underlying Redis event sourcing implementation. 