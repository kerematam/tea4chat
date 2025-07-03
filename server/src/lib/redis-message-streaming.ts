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
import Redis from 'ioredis';

// Redis connection - single shared instance
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  lazyConnect: true,
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

// Helper to discover active chat streams using Redis KEYS command
const discoverActiveChatStreams = async (): Promise<string[]> => {
  try {
    const streamKeys = await redis.keys('message-stream-*:stream');
    const chatIds = streamKeys
      .map(key => key.replace('message-stream-', '').replace(':stream', ''))
      .filter(chatId => chatId.length > 0);
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

// Utility functions

/**
 * Start a new message chunk stream using chatId as streamId
 */
export async function startMessageChunkStream(data: MessageChunkStreamData): Promise<string> {
  const { chatId, userContent, type, intervalMs, maxChunks = 20 } = data;

  // Kick off producer asynchronously (fire-and-forget)
  (async () => {
    const streamName = getStreamName(chatId);

    // Determine starting sequence by reading current length once
    const streamKey = `${streamName}:stream`;
    let seq = await redis.zcard(streamKey);

    let producedEvents = 0; // local counter only for logging

    const enqueue = async (event: StreamMessage) => {
      try {
        // Use local sequence counter (increment after use)
        const currentSeq = seq;
        seq += 1;

        // Append to the sorted set for ordered history
        await redis.zadd(streamKey, currentSeq, JSON.stringify(event));
        await redis.expire(streamKey, 3600);

        // Publish to live subscribers
        const channelKey = `${streamName}:channel`;
        await redis.publish(channelKey, JSON.stringify(event));

        producedEvents += 1;
        console.log(`📝 Stored event ${event.type} for chat ${chatId} (seq: ${currentSeq})`);
      } catch (err: unknown) {
        console.error('❌ enqueue error', err);
      }
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
      if (await redis.exists(stopKey)) {
        console.log(`🛑 Stop requested for chat ${chatId}. Halting stream at chunk ${i}.`);
        break;
      }

      const chunk = chunks[i];
      accumulated += chunk;

      await enqueue({
        type: 'aiMessageChunk',
        messageId: aiMessage.id,
        chunk,
        chunkId: `chunk-${i + 1}`,
        chatId,
      });

      // Small delay between chunks if configured
      if (intervalMs > 0) await new Promise(res => setTimeout(res, intervalMs));
    }

    // Always signal completion so subscribers can finish cleanly
    const completedMessage: MessageType = { ...aiMessage, content: accumulated, text: accumulated };
    await enqueue({ type: 'aiMessageComplete', message: completedMessage, chatId });

    // Clean up stop flag if it was set
    await redis.del(stopKey);

    console.log(`🎬 Enqueued ${producedEvents} events for chat ${chatId}`);
  })();

  // immediately return chatId so caller isn't blocked
  return chatId;
}

/**
 * Stop a message chunk stream by chatId
 */
export async function stopMessageChunkStream(chatId: string): Promise<boolean> {
  try {
    await redis.set(`stop-stream:${chatId}`, '1', 'EX', 60 * 5); // auto-expire in 5 minutes
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
      const eventCount = await redis.zcard(streamKey);
      if (eventCount > 0) {
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
 * Subscribe to message chunk stream events by chatId
 */
export async function* subscribeToMessageChunkStream(chatId: string): AsyncGenerator<StreamMessage, void, unknown> {
  console.log(`🎧 Subscribing to message chunk stream for chat: ${chatId}`);

  const streamKey = `${getStreamName(chatId)}:stream`;
  const channelKey = `${getStreamName(chatId)}:channel`;
  
  // First replay missing history from Redis sorted set
  const fetchHistoricalEvents = async (): Promise<StreamMessage[]> => {
    try {
      const events = await redis.zrange(streamKey, 0, -1);
      return events.map(eventStr => JSON.parse(eventStr) as StreamMessage);
    } catch (error) {
      console.error(`❌ Error fetching historical events for ${chatId}:`, error);
      return [];
    }
  };

  const history = await fetchHistoricalEvents();
  for (const event of history) {
    console.log(`📺 Historical event for ${chatId}: ${event.type}`);
    yield event;
    
    if (event.type === 'aiMessageComplete') {
      console.log(`🏁 Stream already completed for ${chatId}`);
      return; // stream already finished
    }
  }

  // Real-time subscription using Redis pub/sub
  const subscriber = redis.duplicate(); // Create separate connection for subscription
  let resolveNext: ((value: StreamMessage) => void) | null = null;
  let streamCompleted = false;

  const messageHandler = (channel: string, message: string) => {
    if (channel !== channelKey || streamCompleted) return;
    
    try {
      const event = JSON.parse(message) as StreamMessage;
      console.log(`📨 Live event for ${chatId}: ${event.type}`);
      
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      }
      
      if (event.type === 'aiMessageComplete') {
        streamCompleted = true;
      }
    } catch (error) {
      console.error(`❌ Error parsing message for ${chatId}:`, error);
    }
  };

  subscriber.on('message', messageHandler);
  await subscriber.subscribe(channelKey);

  try {
    while (!streamCompleted) {
      const event = await new Promise<StreamMessage>((resolve) => {
        resolveNext = resolve;
      });
      
      console.log(`📤 Yielding live event for ${chatId}: ${event.type}`);
      yield event;
      
      if (event.type === 'aiMessageComplete') {
        console.log(`🏁 Terminal event received for ${chatId}: ${event.type}`);
        break;
      }
    }

    console.log(`🏁 Message stream completed for ${chatId}`);
  } finally {
    await subscriber.unsubscribe(channelKey);
    subscriber.disconnect();
    console.log(`📡 Message chunk stream subscription closed for chat ${chatId}`);
  }
}

/**
 * Get message chunk stream metrics for a specific chat
 */
export async function getMessageChunkStreamMetrics(chatId: string) {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;
    const channelKey = `${getStreamName(chatId)}:channel`;
    
    // Get event count from sorted set
    const totalEvents = await redis.zcard(streamKey);
    
    // Check if stream is completed (has aiMessageComplete event)
    const events = await redis.zrange(streamKey, -1, -1); // Get last event
    const isCompleted = events.length > 0 && 
      (JSON.parse(events[0]!) as StreamMessage).type === 'aiMessageComplete';
    
    // Get TTL for the stream
    const ttl = await redis.ttl(streamKey);
    
    return {
      chatId,
      totalEvents,
      isCompleted,
      ttlSeconds: ttl,
      streamKey,
      channelKey,
    };
  } catch (error) {
    console.error(`❌ Error getting metrics for chat ${chatId}:`, error);
    return {
      chatId,
      totalEvents: 0,
      isCompleted: false,
      ttlSeconds: -1,
      streamKey: '',
      channelKey: '',
    };
  }
}

/**
 * Get metrics for all active chat streams
 */
export async function getAllMessageChunkStreamMetrics() {
  const chatIds = await discoverActiveChatStreams();
  const allMetrics = await Promise.all(
    chatIds.map(chatId => getMessageChunkStreamMetrics(chatId))
  );

  return {
    totalChats: allMetrics.length,
    chats: allMetrics,
    activeStreams: await getActiveMessageChunkStreams()
  };
}

/**
 * Clean up inactive message chunk streams for a specific chat
 */
export async function cleanupInactiveMessageChunkStreams(chatId: string) {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;
    const channelKey = `${getStreamName(chatId)}:channel`;
    
    // Delete the stream and related keys
    const deletedKeys = await redis.del(streamKey);
    await redis.del(channelKey);
    
    console.log(`🧹 Cleaned up stream for ${chatId}. Removed ${deletedKeys} stream keys`);
    return { chatId, removedKeys: deletedKeys };
  } catch (error) {
    console.error(`❌ Error during cleanup for ${chatId}:`, error);
    throw error;
  }
}

/**
 * Clean up all inactive message chunk streams
 */
export async function cleanupAllInactiveMessageChunkStreams() {
  const chatIds = await discoverActiveChatStreams();
  const results = await Promise.all(
    chatIds.map(chatId => cleanupInactiveMessageChunkStreams(chatId))
  );
  
  const totalRemoved = results.reduce((sum: number, result: any) => sum + result.removedKeys, 0);
  console.log(`🧹 Total cleanup completed. Removed ${totalRemoved} stream keys across ${results.length} chats`);
  
  return { totalChats: results.length, totalRemoved, details: results };
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