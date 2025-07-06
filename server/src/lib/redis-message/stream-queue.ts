/**
 * Redis Stream Queue Abstraction
 * 
 * Provides batching and Redis stream operations abstraction
 */

import { redisWriter } from './clients';
import type { BatchedQueue, BatchedQueueOptions, StreamMessage, StreamQueue, StreamQueueOptions } from './types';

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;

// Generic batching abstraction
export function createBatchedQueue<T>(
  options: BatchedQueueOptions,
  flushHandler: (items: T[]) => Promise<void>
): BatchedQueue<T> {
  const { batchTimeMs = 50, maxBatchSize = 10 } = options;

  let itemBuffer: T[] = [];
  let flushInterval: NodeJS.Timeout | null = null;
  let isDestroyed = false;

  const executeBatch = async () => {
    if (itemBuffer.length === 0 || isDestroyed) return;

    const itemsToFlush = [...itemBuffer];
    itemBuffer = [];

    try {
      await flushHandler(itemsToFlush);
    } catch (error) {
      console.error('❌ Batch execution error:', error);
    }
  };

  const startThrottledFlush = () => {
    if (isDestroyed || flushInterval) return;

    // Fixed interval throttling - flush every batchTimeMs regardless of when items are added
    flushInterval = setInterval(async () => {
      if (isDestroyed) return;

      // Only flush if there are items in the buffer
      if (itemBuffer.length > 0) {
        await executeBatch();
      }
    }, batchTimeMs);
  };

  const add = async (item: T): Promise<void> => {
    if (isDestroyed) {
      throw new Error('BatchedQueue has been destroyed');
    }

    itemBuffer.push(item);

    // Start the throttled flush interval if not already running
    if (!flushInterval) {
      startThrottledFlush();
    }

    // Flush immediately if buffer is full (bypass throttling for full buffers)
    if (itemBuffer.length >= maxBatchSize) {
      await executeBatch();
    }
  };

  const flush = async (): Promise<void> => {
    await executeBatch();
  };

  const destroy = (): void => {
    isDestroyed = true;
    if (flushInterval) {
      clearInterval(flushInterval);
      flushInterval = null;
    }
    itemBuffer = [];
  };

  return { add, flush, destroy };
}

// Redis Stream abstraction
export function createStreamQueue(chatId: string, options: StreamQueueOptions = {}): StreamQueue {
  const { batchTimeMs = 1000, maxBatchSize = 100, expireAfterSeconds = 3600 } = options;
  
  const streamKey = `${getStreamName(chatId)}:stream`;
  let producedEvents = 0;
  let hasSetExpiration = false;

  // Create batched queue for Redis stream operations
  const batchedQueue = createBatchedQueue<StreamMessage>(
    { batchTimeMs, maxBatchSize },
    async (events: StreamMessage[]) => {
      // Redis pipeline operation for batching XADD commands
      const pipeline = redisWriter.pipeline();

      events.forEach(event => {
        pipeline.xadd(
          streamKey,
          // TODO: we should save data to db before trimming from stream
          // 'MAXLEN', '~', '10000', // Keep approximately N most recent messages
          '*', // Let Redis generate the ID automatically
          'event', JSON.stringify(event)
        );
      });

      // Execute all XADD operations in a single network round-trip
      await pipeline.exec();

      // Set expiration on first batch (stream creation)
      if (!hasSetExpiration) {
        await redisWriter.expire(streamKey, expireAfterSeconds);
        console.log(`⏰ Set ${expireAfterSeconds}s expiration on stream: ${streamKey}`);
        hasSetExpiration = true;
      }

      producedEvents += events.length;
      console.log(`📝 Batched ${events.length} events for chat ${chatId} (total: ${producedEvents})`);
    }
  );

  return {
    enqueue: async (event: StreamMessage) => {
      await batchedQueue.add(event);
    },
    flush: async () => {
      await batchedQueue.flush();
    },
    destroy: () => {
      batchedQueue.destroy();
    }
  };
} 