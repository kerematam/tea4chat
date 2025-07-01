/**
 * Message Chunk-based BullMQ Streaming Utilities
 * 
 * Utility functions for BullMQ streaming using MessageType structure from messageRouter.ts.
 * Designed for streaming message chunks similar to sendWithStream pattern.
 */

import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

// Redis connection
const createRedisConnection = () => new Redis({
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

// Job data for message chunk streaming
export interface MessageChunkStreamJobData {
  chatId: string; // chatId serves as both streamId and jobId
  userContent: string;
  type: 'demo' | 'ai' | 'conversation';
  intervalMs: number;
  maxChunks?: number;
  ownerId?: string;
  config?: Record<string, any>;
  shouldStop?: boolean;
  stoppedAt?: string;
}

// Queue instances
export const messageChunkStreamQueue = new Queue('message-chunk-stream-processing', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
});
export const messageChunkQueueEvents = new QueueEvents('message-chunk-stream-processing', { connection: createRedisConnection() });

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

// Message chunk stream job processor
const processMessageChunkStreamJob = async (job: Job<MessageChunkStreamJobData>) => {
  const { chatId, userContent, type, intervalMs, maxChunks = 20 } = job.data;

  console.log(`🚀 Starting message chunk stream job for chat: ${chatId}`);

  try {
    const progress: StreamMessage[] = [];

    // 1. First yield the user message
    const userMessage: MessageType = {
      id: `user_${randomBytes(8).toString('hex')}`,
      createdAt: new Date(),
      chatId,
      content: userContent,
      from: "user",
      text: userContent,
    };

    const userMessageEvent: StreamMessage = {
      type: "userMessage",
      message: userMessage,
      chatId,
    };

    progress.push(userMessageEvent);
    await job.updateProgress(progress);

    // Check for stop signal
    let currentJob = await Job.fromId(messageChunkStreamQueue, chatId);
    if (await job.isCompleted() || await job.isFailed() || currentJob?.data.shouldStop) {
      console.log(`🛑 Stop signal received for chat: ${chatId}`);
      return;
    }

    // 2. Create and yield the AI message start
    const aiMessage: MessageType = {
      id: `ai_${randomBytes(8).toString('hex')}`,
      createdAt: new Date(),
      chatId,
      content: "",
      from: "assistant",
      text: "",
    };

    const aiMessageStartEvent: StreamMessage = {
      type: "aiMessageStart",
      message: aiMessage,
      chatId,
    };

    progress.push(aiMessageStartEvent);
    await job.updateProgress(progress);
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    // 3. Generate the full AI response content
    const fullContent = generateContent(type, userContent);
    const chunks = splitIntoChunks(fullContent, maxChunks);

    // 4. Stream the chunks
    let accumulatedContent = "";
    for (let i = 0; i < chunks.length; i++) {
      // Check for stop signal
      currentJob = await Job.fromId(messageChunkStreamQueue, chatId);
      if (await job.isCompleted() || await job.isFailed() || currentJob?.data.shouldStop) {
        console.log(`🛑 Stop signal received during chunk ${i + 1} for chat: ${chatId}`);
        break;
      }

      const chunk = chunks[i];
      accumulatedContent += chunk;

      const chunkEvent: StreamMessage = {
        type: "aiMessageChunk",
        messageId: aiMessage.id,
        chunk: chunk,
        chunkId: `chunk-${i + 1}`,
        chatId,
      };

      progress.push(chunkEvent);
      await job.updateProgress(progress);

      console.log(`📝 Message chunk stream ${chatId}: Chunk ${i + 1}/${chunks.length}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    // 5. Complete the AI message
    const completedAiMessage: MessageType = {
      ...aiMessage,
      content: accumulatedContent,
      text: accumulatedContent,
    };

    const aiMessageCompleteEvent: StreamMessage = {
      type: "aiMessageComplete",
      message: completedAiMessage,
      chatId,
    };

    progress.push(aiMessageCompleteEvent);
    await job.updateProgress(progress);

    console.log(`✅ Message chunk stream ${chatId} completed`);

    return {
      chatId,
      totalChunks: chunks.length,
      totalMessages: 2, // user + ai message
      status: 'completed'
    };
  } catch (error) {
    console.error(`❌ Error in message chunk stream ${chatId}:`, error);
    throw error;
  }
};

// Worker instance
export const messageChunkStreamWorker = new Worker('message-chunk-stream-processing', processMessageChunkStreamJob, {
  connection: createRedisConnection(),
  concurrency: 3,
});

// Worker event handlers
messageChunkStreamWorker.on('completed', (job) => {
  console.log(`✅ Message chunk stream job ${job.id || 'unknown'} completed`);
});

messageChunkStreamWorker.on('failed', (job, err) => {
  console.error(`❌ Message chunk stream job ${job?.id || 'unknown'} failed:`, err.message);
});

// Utility functions

/**
 * Start a new message chunk stream using chatId as jobId
 */
export async function startMessageChunkStream(data: MessageChunkStreamJobData): Promise<string> {
  const job = await messageChunkStreamQueue.add('process-message-chunk-stream', data, {
    jobId: data.chatId, // Use chatId as jobId
    removeOnComplete: true,
    removeOnFail: true,
  });

  console.log(`🎬 Started message chunk stream for chat: ${data.chatId} (job: ${job.id || 'unknown'})`);
  return data.chatId;
}

/**
 * Stop a message chunk stream by chatId
 */
export async function stopMessageChunkStream(chatId: string): Promise<boolean> {
  try {
    const job = await Job.fromId(messageChunkStreamQueue, chatId);

    if (job) {
      await job.updateData({
        ...job.data,
        shouldStop: true,
        stoppedAt: new Date().toISOString()
      });

      console.log(`🛑 Stop signal sent for chat: ${chatId}`);
      return true;
    }

    console.log(`⚠️ Message chunk stream for chat ${chatId} not found`);
    return false;
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
    const activeJobs = await messageChunkStreamQueue.getActive();
    return activeJobs.map(job => ({
      streamId: job.data.chatId, // streamId = chatId
      chatId: job.data.chatId,
      jobId: job.id || 'unknown'
    }));
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

  let listener: (data: { jobId: string; data: unknown }) => void;
  let lastSeenEventIndex = -1;

  const eventStream = new ReadableStream<StreamMessage>({
    start: (controller) => {
      listener = ({ jobId, data }) => {
        if (jobId !== chatId) return; // jobId = chatId

        const events = Array.isArray(data) ? data as StreamMessage[] : [];
        events.forEach((event, index) => {
          if (index > lastSeenEventIndex) {
            console.log(`📨 Event ${index} for chat ${chatId}: ${event.type}`);
            controller.enqueue(event);
            lastSeenEventIndex = index;
            console.log(event);
            if (event.type === 'aiMessageComplete') {
              controller.close();
            }
          }
        });
      };

      messageChunkQueueEvents.on('progress', listener);
    }
  });

  try {
    for await (const event of eventStream) {
      console.log(`📤 Yielding event for chat ${chatId}: ${event.type}`);
      yield event;

      if (event.type === 'aiMessageComplete') {
        console.log(`🏁 Terminal event received for chat ${chatId}: ${event.type}`);
        break;
      }
    }
  } finally {
    messageChunkQueueEvents.off('progress', listener!);
    console.log(`📡 Message chunk stream subscription closed for chat ${chatId}`);
  }
}

/**
 * Get message chunk stream queue metrics
 */
export async function getMessageChunkStreamMetrics() {
  const [waiting, active, completed, failed, paused] = await Promise.all([
    messageChunkStreamQueue.getWaiting(),
    messageChunkStreamQueue.getActive(),
    messageChunkStreamQueue.getCompleted(),
    messageChunkStreamQueue.getFailed(),
    messageChunkStreamQueue.getJobs(['paused'])
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    paused: paused.length,
    activeStreams: await getActiveMessageChunkStreams()
  };
}

/**
 * Clean up inactive message chunk stream jobs
 */
export async function cleanupInactiveMessageChunkStreamJobs() {
  try {
    const stalledJobs = await messageChunkStreamQueue.getJobs(['paused']);
    for (const job of stalledJobs) {
      console.log(`🧹 Cleaning stalled message chunk stream job: ${job.id || 'unknown'}`);
      await job.remove();
    }

    await messageChunkStreamQueue.clean(3600 * 1000, 100, 'completed');
    await messageChunkStreamQueue.clean(24 * 3600 * 1000, 50, 'failed');

    console.log(`🧹 Message chunk stream cleanup completed. Removed ${stalledJobs.length} stalled jobs`);
    return { removedStalled: stalledJobs.length };
  } catch (error) {
    console.error('❌ Error during message chunk stream cleanup:', error);
    throw error;
  }
}

// Cleanup on process exit
const cleanup = async () => {
  console.log('🧹 Cleaning up message chunk stream BullMQ resources...');
  await messageChunkStreamWorker.close();
  await messageChunkStreamQueue.close();
  await messageChunkQueueEvents.close();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup); 