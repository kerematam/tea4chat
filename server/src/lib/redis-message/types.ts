/**
 * Type definitions for Redis Message Streaming
 */

// MessageType from messageRouter.ts
export interface MessageType {
  id: string;
  createdAt: Date;
  chatId: string;
  content: string;
  from: string;
}

// StreamMessage type similar to messageRouter.ts
export type StreamMessage = {
  type: "userMessage" | "aiMessageStart" | "aiMessageChunk" | "aiMessageComplete";
  message?: MessageType;
  messageId?: string;
  chunk?: string;
  chunkId?: string;
  chatId: string;
};

// Stream data for message chunk streaming
export interface MessageChunkStreamData {
  chatId: string; // chatId serves as streamId
  userContent: string;
  type: 'demo' | 'ai' | 'conversation';
  intervalMs: number;
  maxChunks?: number;
  ownerId?: string;
  config?: Record<string, any>;
  shouldStop?: boolean;
  stoppedAt?: string;
}

// Generic batching abstraction
export interface BatchedQueueOptions {
  batchTimeMs?: number;
  maxBatchSize?: number;
}

export interface BatchedQueue<T> {
  add: (item: T) => Promise<void>;
  flush: () => Promise<void>;
  destroy: () => void;
}

// Redis Stream abstraction
export interface StreamQueueOptions {
  batchTimeMs?: number;
  maxBatchSize?: number;
  expireAfterSeconds?: number;
}

export interface StreamQueue {
  enqueue: (event: StreamMessage) => Promise<void>;
  cleanup: () => Promise<void>;
}

// Stream metrics
export interface StreamMetrics {
  chatId: string;
  streamKey: string;
  totalMessages: number;
  firstMessageId: string | null;
  lastMessageId: string | null;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  ageSeconds: number;
}

// Active stream info
export interface ActiveStreamInfo {
  streamId: string;
  chatId: string;
  jobId: string;
} 