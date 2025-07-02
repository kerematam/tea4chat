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

// Job data for each individual chunk
interface ChunkJobData {
  chatId: string;
  seq: number;
  event: StreamMessage;
}

const messageChunkStreamQueueName = 'message-chunk-stream-processing';

// Queue instances
export const messageChunkStreamQueue = new Queue<ChunkJobData>(messageChunkStreamQueueName, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: true,
    attempts: 1,
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

// Lightweight worker: simply marks each chunk job as completed and makes its data available via QueueEvents
export const messageChunkStreamWorker = new Worker<ChunkJobData>(
  messageChunkStreamQueueName,
  async (job: Job<ChunkJobData>) => {
    // Return the job data so listeners can access it via QueueEvents 'completed' event
    return job.data;
  },
  {
    connection: createRedisConnection(),
    concurrency: 50,
  }
);

messageChunkStreamWorker.on('completed', (job) => {
  console.log(`✅ Chunk job completed: ${job.id}`);
});

messageChunkStreamWorker.on('failed', (job, err) => {
  console.error(`❌ Chunk job failed: ${job?.id}.`, err.message);
});

// Utility functions

/**
 * Start a new message chunk stream using chatId as jobId
 */
export async function startMessageChunkStream(data: MessageChunkStreamJobData): Promise<string> {
  const { chatId, userContent, type, intervalMs, maxChunks = 20 } = data;

  // Kick off producer asynchronously (fire-and-forget)
  (async () => {
    let seq = 0;

    const enqueue = async (event: StreamMessage) => {
      const jobId = `${chatId}:${seq}`;
      try {
        await messageChunkStreamQueue.add('chunk', { chatId, seq, event } as ChunkJobData, {
          jobId,
          removeOnComplete: false,
          attempts: 1,
        });
        seq += 1;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Job with the name')) {
          seq += 1; // duplicate
        } else {
          console.error('❌ enqueue error', err);
        }
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

    let accumulated = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      accumulated += chunk;
      await enqueue({
        type: 'aiMessageChunk',
        messageId: aiMessage.id,
        chunk,
        chunkId: `chunk-${i + 1}`,
        chatId,
      });
      if (intervalMs > 0) await new Promise(res => setTimeout(res, intervalMs));
    }

    const completedMessage: MessageType = { ...aiMessage, content: accumulated, text: accumulated };
    await enqueue({ type: 'aiMessageComplete', message: completedMessage, chatId });

    console.log(`🎬 Enqueued ${seq} events for chat ${chatId}`);
  })();

  // immediately return chatId so caller isn't blocked
  return chatId;
}

/**
 * Stop a message chunk stream by chatId
 */
export async function stopMessageChunkStream(chatId: string): Promise<boolean> {
  try {
    const redis = createRedisConnection();
    await redis.set(`stop-stream:${chatId}`, '1', 'EX', 60 * 5); // auto-expire in 5 minutes
    await redis.quit();
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
    const activeJobs = await messageChunkStreamQueue.getActive();
    const seen = new Set<string>();
    const result: { streamId: string; chatId: string; jobId: string }[] = [];

    for (const job of activeJobs) {
      const chatId = job.data.chatId;
      if (!seen.has(chatId)) {
        seen.add(chatId);
        result.push({ streamId: chatId, chatId, jobId: job.id || 'unknown' });
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

  const prefix = `${chatId}:`;
  
  // First replay missing history
  const fetchCompletedChunks = async () => {
    const allCompleted = await messageChunkStreamQueue.getJobs(['completed'], 0, -1, false);
    return allCompleted
      .filter(j => (j.id as string).startsWith(prefix))
      .sort((a, b) => (a.data.seq - b.data.seq));
  };

  const history = await fetchCompletedChunks();
  for (const job of history) {
    const completedData = job.returnvalue as ChunkJobData | undefined;
    const event: StreamMessage = completedData?.event ?? job.data.event;
    console.log(`📺 Historical event for ${chatId}: ${event.type}`);
    yield event;
    
    if (event.type === 'aiMessageComplete') {
      console.log(`🏁 Stream already completed for ${chatId}`);
      return; // stream already finished
    }
  }

  // Real-time subscription using simple promise-based approach
  let resolveNext: ((value: StreamMessage) => void) | null = null;
  let streamCompleted = false;

  const listener = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
    if (!jobId.startsWith(prefix) || streamCompleted) return;
    
    const chunkData = returnvalue as ChunkJobData | undefined;
    const event: StreamMessage = chunkData?.event ?? (returnvalue as StreamMessage);
    
    console.log(`📨 Live event for ${chatId}: ${event.type}`);
    
    if (resolveNext) {
      resolveNext(event);
      resolveNext = null;
    }
    
    if (event.type === 'aiMessageComplete') {
      streamCompleted = true;
    }
  };

  messageChunkQueueEvents.on('completed', listener);

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
    messageChunkQueueEvents.off('completed', listener);
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