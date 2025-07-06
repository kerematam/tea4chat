/**
 * Redis-based Message Streaming Utilities
 *
 * Utility functions for streaming using MessageType structure from
 * messageRouter.ts. Uses Redis sorted sets for history, pub/sub for real-time,
 * and TTL for cleanup. Stateless design for clustered architecture.
 *
 * The approach satisfies "resume / multi-device replay" because history is
 * persisted independently of the live pub/sub channel.
 * 
 */

import { randomBytes } from 'crypto';
import { redis } from './redis';

// Create separate Redis clients for optimal performance
// Writer client - dedicated for XADD operations (fast, non-blocking)
const redisWriter = redis.duplicate();

// Reader client - dedicated for XREAD operations (can block without affecting writes)
const redisReader = redis.duplicate();

// Utility client - for general operations like SCAN, TYPE, DEL
const redisUtil = redis.duplicate();

// Handle Redis connection events for writer client
redisWriter.on('connect', () => {
  console.log('Redis Writer client connected successfully');
});

redisWriter.on('error', (error) => {
  console.error('Redis Writer client connection error:', error);
});

// Handle Redis connection events for reader client
redisReader.on('connect', () => {
  console.log('Redis Reader client connected successfully');
});

redisReader.on('error', (error) => {
  console.error('Redis Reader client connection error:', error);
});

// Handle Redis connection events for utility client
redisUtil.on('connect', () => {
  console.log('Redis Utility client connected successfully');
});

redisUtil.on('error', (error) => {
  console.error('Redis Utility client connection error:', error);
});

// Keep original for backwards compatibility (will be deprecated)
redis.on('connect', () => {
  console.log('Redis Message Streaming connected successfully');
});

redis.on('error', (error) => {
  console.error('Redis Message Streaming connection error:', error);
});

// MessageType from messageRouter.ts
export interface MessageType {
  id: string;
  createdAt: Date;
  chatId: string;
  content: string;
  from: string;
  text: string;
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

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;



// Helper to discover active chat streams using non-blocking SCAN
const discoverActiveChatStreams = async (): Promise<string[]> => {
  const pattern = 'message-stream-*:stream';
  const chatIds: string[] = [];

  try {
    let cursor = '0';
    do {
      // SCAN cursor MATCH pattern COUNT 100
      const [nextCursor, keys] = await redisUtil.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = nextCursor;

      chatIds.push(
        ...keys
          .map(key => key.replace('message-stream-', '').replace(':stream', ''))
          .filter(id => id.length > 0)
      );
    } while (cursor !== '0');

    return chatIds;
  } catch (error) {
    console.error('❌ Error discovering active chat streams:', error);
    return [];
  }
};

// Content generator utility for different types
const generateContent = (type: 'demo' | 'ai' | 'conversation', userContent: string): string => {
  switch (type) {
    case 'demo':
      return `Demo response to "${userContent}": This is a simulated response with multiple chunks. Each chunk represents a portion of the AI response being streamed in real-time. The system demonstrates how content can be delivered progressively to provide better user experience during AI generation. This approach allows users to see partial responses while the full response is still being processed, making the interaction feel more responsive and engaging.`;

    case 'ai':
      return `AI response to "${userContent}": Artificial Intelligence systems work by processing input data through complex neural networks that have been trained on vast amounts of text and information. When you ask a question, the AI analyzes the context, draws from its training knowledge, and generates a response by predicting the most appropriate words and phrases to use. This process involves multiple layers of computation and pattern recognition that happen very quickly, allowing for near real-time responses to complex queries and conversations.`;

    case 'conversation':
      return `Thank you for your message: "${userContent}". I understand your request and I'm here to help you with whatever you need. Whether you have questions about specific topics, need assistance with tasks, or just want to have a conversation, I'm ready to provide helpful and informative responses. Feel free to ask me anything you'd like to know more about, and I'll do my best to provide clear and useful information.`;

    default:
      return `Response to "${userContent}": This is a default response that will be streamed in chunks.`;
  }
};

// Split content into chunks for streaming
const splitIntoChunks = (content: string, numChunks: number): string[] => {
  if (numChunks <= 1) return [content];

  const words = content.split(' ');
  const chunkSize = Math.ceil(words.length / numChunks);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk + (i + chunkSize < words.length ? ' ' : ''));
  }

  return chunks;
};

// Generic batching abstraction
interface BatchedQueueOptions {
  batchTimeMs?: number;
  maxBatchSize?: number;
}

interface BatchedQueue<T> {
  add: (item: T) => Promise<void>;
  flush: () => Promise<void>;
  destroy: () => void;
}

function createBatchedQueue<T>(
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

// Utility functions

/**
 * Start a new message chunk stream using chatId as streamId
 */
export async function startMessageChunkStream(data: MessageChunkStreamData): Promise<string> {
  const { chatId, userContent, type, intervalMs, maxChunks = 20 } = data;

  // Kick off producer asynchronously (fire-and-forget)
  (async () => {
    const streamName = getStreamName(chatId);
    const streamKey = `${streamName}:stream`;

    let producedEvents = 0; // local counter only for logging

    // Create batched queue for Redis stream operations
    const streamQueue = createBatchedQueue<StreamMessage>(
      { batchTimeMs: 2000, maxBatchSize: 100 },
      async (events: StreamMessage[]) => {
        // Redis pipeline operation for batching XADD commands
        const pipeline = redisWriter.pipeline();

        events.forEach(event => {
          pipeline.xadd(
            streamKey,
            'MAXLEN', '~', '1000', // Keep approximately 1000 most recent messages
            '*', // Let Redis generate the ID automatically
            'event', JSON.stringify(event)
          );
        });

        // Execute all XADD operations in a single network round-trip
        await pipeline.exec();

        producedEvents += events.length;
        console.log(`📝 Batched ${events.length} events for chat ${chatId} (total: ${producedEvents})`);
      }
    );

    // Simple enqueue function using the batched queue
    const enqueue = async (event: StreamMessage) => {
      await streamQueue.add(event);
      // await redisWriter.xadd(
      //   streamKey,
      //   'MAXLEN', '~', '1000', // Keep approximately 1000 most recent messages
      //   '*', // Let Redis generate the ID automatically
      //   'event', JSON.stringify(event)
      // );
    };

    // user message
    const userMessage: MessageType = {
      id: `user_${randomBytes(8).toString('hex')}`,
      createdAt: new Date(),
      chatId,
      content: userContent,
      from: 'user',
      text: userContent,
    };
    await enqueue({ type: 'userMessage', message: userMessage, chatId });

    // ai start
    const aiMessage: MessageType = {
      id: `ai_${randomBytes(8).toString('hex')}`,
      createdAt: new Date(),
      chatId,
      content: '',
      from: 'assistant',
      text: '',
    };
    await enqueue({ type: 'aiMessageStart', message: aiMessage, chatId });

    const fullContent = generateContent(type, userContent);
    const chunks = splitIntoChunks(fullContent, maxChunks);

    const stopKey = `stop-stream:${chatId}`;
    let accumulated = '';

    for (let i = 0; i < chunks.length; i++) {
      // Check stop flag before producing next chunk
      if (await redisUtil.exists(stopKey)) {
        console.log(`🛑 Stop requested for chat ${chatId}. Halting stream at chunk ${i}.`);
        break;
      }

      const chunk = chunks[i];
      accumulated += chunk;
      console.log(`🎬 Streamed chunk ${i + 1} for chat ${chatId}`);
      await enqueue({
        type: 'aiMessageChunk',
        messageId: aiMessage.id,
        chunk,
        chunkId: `chunk-${i + 1}`,
        chatId,
      });

      // Small delay between chunks if configured
      console.log(`🎬 Waiting for ${intervalMs}ms before next chunk`);
      if (intervalMs > 0) await new Promise(res => setTimeout(res, intervalMs));
    }

    // Always signal completion so subscribers can finish cleanly
    const completedMessage: MessageType = { ...aiMessage, content: accumulated, text: accumulated };
    await enqueue({ type: 'aiMessageComplete', message: completedMessage, chatId });

    // Flush any remaining events in the buffer
    await streamQueue.flush();

    // Clean up the queue
    streamQueue.destroy();

    // Clean up stop flag if it was set
    await redisUtil.del(stopKey);

    console.log(`🎬 Streamed ${producedEvents} events for chat ${chatId}`);
  })();

  // immediately return chatId so caller isn't blocked
  return chatId;
}

/**
 * Stop a message chunk stream by chatId
 */
export async function stopMessageChunkStream(chatId: string): Promise<boolean> {
  try {
    await redisUtil.set(`stop-stream:${chatId}`, '1', 'EX', 60 * 5); // auto-expire in 5 minutes
    console.log(`🛑 Stop flag set for chat: ${chatId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error stopping message chunk stream ${chatId}:`, error);
    return false;
  }
}

/**
 * Get active message chunk streams
 */
export async function getActiveMessageChunkStreams(): Promise<{ streamId: string; chatId: string; jobId: string }[]> {
  try {
    const result: { streamId: string; chatId: string; jobId: string }[] = [];

    // Check all active chat streams
    const chatIds = await discoverActiveChatStreams();
    for (const chatId of chatIds) {
      const streamKey = `${getStreamName(chatId)}:stream`;

      // Check key type first to handle transition from sorted sets
      const keyType = await redisUtil.type(streamKey);

      if (keyType === 'zset') {
        // Old sorted set key - migrate to stream
        console.log(`⚠️ Found old sorted set key for chat ${chatId}, migrating to stream...`);

        try {
          // Get all events from sorted set
          const events = await redisUtil.zrange(streamKey, 0, -1);

          // Delete the old sorted set
          await redisUtil.del(streamKey);

          // Add events to new stream
          if (events.length > 0) {
            const pipeline = redisWriter.pipeline();
            events.forEach(eventStr => {
              pipeline.xadd(streamKey, '*', 'event', eventStr);
            });
            await pipeline.exec();

            console.log(`✅ Migrated ${events.length} events from sorted set to stream for chat ${chatId}`);
          }
        } catch (migrationError) {
          console.error(`❌ Error migrating sorted set for chat ${chatId}:`, migrationError);
          // If migration fails, skip this stream
          continue;
        }
      } else if (keyType === 'none') {
        // Key doesn't exist, skip
        continue;
      } else if (keyType !== 'stream') {
        // Key exists but wrong type and not a sorted set
        console.log(`⚠️ Key ${streamKey} has unexpected type: ${keyType}, deleting...`);
        await redisUtil.del(streamKey);
        continue;
      }

      // Now we can safely use stream operations
      const streamLength = await redisUtil.xlen(streamKey);
      if (streamLength > 0) {
        result.push({ streamId: chatId, chatId, jobId: streamKey });
      }
    }

    return result;
  } catch (error) {
    console.error(`❌ Error getting active message chunk streams:`, error);
    return [];
  }
}

/**
 * Subscribe to message chunk stream events using pure Redis Streams
 */
export async function* subscribeToMessageChunkStream(chatId: string): AsyncGenerator<StreamMessage, void, unknown> {
  console.log(`🎧 Subscribing to Redis Streams for chat: ${chatId}`);

  const streamKey = `${getStreamName(chatId)}:stream`;
  let lastSeenId = '0'; // Start from beginning
  let streamCompleted = false;

  try {
    // Phase 1: Read all historical messages from the beginning
    console.log(`📚 Reading historical messages for chat ${chatId}`);

    // Phase 2: Real-time consumption using XREAD BLOCK
    console.log(`🔴 Switching to real-time mode for chat ${chatId}`);

    while (!streamCompleted) {
      const messages = await redisReader.xread(
        'COUNT', "500", // read 500 messages at a time to prevent memory bloat
        'BLOCK', "30000", // drop the connection if no messages are available for 30 seconds
        'STREAMS', streamKey, lastSeenId) as Array<[string, Array<[string, string[]]>]> | null;

      if (!messages || messages.length === 0) {
        continue;
      }

      const streamData = messages[0];
      if (streamData) {
        const [, entries] = streamData;

        for (const [messageId, fields] of entries) {
          const eventData = fields[1]; // 'event' field value
          if (eventData) {
            const event = JSON.parse(eventData) as StreamMessage;
            console.log(`📨 Real-time event for ${chatId}: ${event.type}`);

            yield event;
            lastSeenId = messageId; // Update last seen ID

            if (event.type === 'aiMessageComplete') {
              console.log(`🏁 Real-time stream completed for ${chatId}`);
              streamCompleted = true;
              break;
            }
          }
        }
      }
    }

  } catch (error) {
    console.error(`❌ Error in stream subscription for ${chatId}:`, error);
  } finally {
    console.log(`📡 Redis Streams subscription closed for chat ${chatId}`);
  }
}

/**
 * Get message chunk stream metrics for a specific chat
 */
export async function getMessageChunkStreamMetrics(chatId: string) {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;

    // Check key type first to handle transition from sorted sets
    const keyType = await redisUtil.type(streamKey);

    if (keyType === 'zset') {
      // Old sorted set key - migrate to stream or skip
      console.log(`⚠️ Found old sorted set key for chat ${chatId}, migrating to stream...`);

      try {
        // Get all events from sorted set
        const events = await redisUtil.zrange(streamKey, 0, -1);

        // Delete the old sorted set
        await redisUtil.del(streamKey);

        // Add events to new stream
        if (events.length > 0) {
          const pipeline = redisWriter.pipeline();
          events.forEach(eventStr => {
            pipeline.xadd(streamKey, '*', 'event', eventStr);
          });
          await pipeline.exec();

          console.log(`✅ Migrated ${events.length} events from sorted set to stream for chat ${chatId}`);
        }
      } catch (migrationError) {
        console.error(`❌ Error migrating sorted set for chat ${chatId}:`, migrationError);
        // If migration fails, just delete the old key
        await redisUtil.del(streamKey);
        return null;
      }
    } else if (keyType === 'none') {
      // Key doesn't exist
      return null;
    } else if (keyType !== 'stream') {
      // Key exists but wrong type and not a sorted set
      console.log(`⚠️ Key ${streamKey} has unexpected type: ${keyType}, deleting...`);
      await redisUtil.del(streamKey);
      return null;
    }

    // Now we can safely use stream operations
    const streamLength = await redisUtil.xlen(streamKey);

    let firstId = null;
    let lastId = null;
    let oldestTimestamp = null;
    let newestTimestamp = null;

    if (streamLength > 0) {
      // Get first and last message IDs
      const firstMessages = await redisUtil.xrange(streamKey, '-', '+', 'COUNT', '1');
      const lastMessages = await redisUtil.xrevrange(streamKey, '+', '-', 'COUNT', '1');

      if (firstMessages.length > 0 && firstMessages[0]) {
        firstId = firstMessages[0][0];
        // Extract timestamp from stream ID (format: timestamp-sequence)
        const timestampPart = firstId.split('-')[0];
        if (timestampPart) {
          oldestTimestamp = parseInt(timestampPart);
        }
      }

      if (lastMessages.length > 0 && lastMessages[0]) {
        lastId = lastMessages[0][0];
        const timestampPart = lastId.split('-')[0];
        if (timestampPart) {
          newestTimestamp = parseInt(timestampPart);
        }
      }
    }

    return {
      chatId,
      streamKey,
      totalMessages: streamLength,
      firstMessageId: firstId,
      lastMessageId: lastId,
      oldestTimestamp,
      newestTimestamp,
      ageSeconds: newestTimestamp && oldestTimestamp ? (newestTimestamp - oldestTimestamp) / 1000 : 0
    };
  } catch (error) {
    console.error(`❌ Error getting message chunk stream metrics for ${chatId}:`, error);
    return null;
  }
}

/**
 * Get metrics for all active message chunk streams
 */
export async function getAllMessageChunkStreamMetrics() {
  try {
    const chatIds = await discoverActiveChatStreams();
    const metrics = await Promise.all(
      chatIds.map(chatId => getMessageChunkStreamMetrics(chatId))
    );

    return metrics.filter(m => m !== null);
  } catch (error) {
    console.error(`❌ Error getting all message chunk stream metrics:`, error);
    return [];
  }
}

/**
 * Clean up inactive message chunk streams for a specific chat
 */
export async function cleanupInactiveMessageChunkStreams(chatId: string) {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;

    // Delete the stream
    const result = await redisUtil.del(streamKey);

    console.log(`🧹 Cleaned up stream for chat ${chatId}: ${result} keys deleted`);
    return result > 0;
  } catch (error) {
    console.error(`❌ Error cleaning up message chunk streams for ${chatId}:`, error);
    return false;
  }
}

/**
 * Clean up all inactive message chunk streams
 */
export async function cleanupAllInactiveMessageChunkStreams() {
  try {
    const chatIds = await discoverActiveChatStreams();
    let totalCleaned = 0;

    for (const chatId of chatIds) {
      const cleaned = await cleanupInactiveMessageChunkStreams(chatId);
      if (cleaned) totalCleaned++;
    }

    console.log(`🧹 Cleaned up ${totalCleaned} inactive message chunk streams`);
    return totalCleaned;
  } catch (error) {
    console.error(`❌ Error cleaning up all inactive message chunk streams:`, error);
    return 0;
  }
}

// Cleanup on process exit
const cleanup = async () => {
  console.log('🧹 Cleaning up message chunk stream resources...');

  // Close the shared Redis connection
  await redis.quit();

  console.log('🧹 Redis connection closed');
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup); 