/**
 * Native BullMQ Streaming using Built-in Progress and Events
 * 
 * Uses BullMQ's native job.getProgress() and QueueEvents.on('progress') 
 * for historical replay and real-time streaming. No custom Redis logic needed.
 */

import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

// Redis connection for BullMQ
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

// Stream chunk interface (what we store in job progress)
export interface StreamChunk {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  chunkNumber: number;
  content?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Job data interface
export interface StreamJobData {
  streamId: string;
  type: 'demo' | 'ai' | 'custom';
  intervalMs: number;
  maxChunks?: number;
  ownerId?: string;
  config?: Record<string, any>;
}

// BullMQ Queue Configuration
const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
};

// Create queue and events
export const streamQueue = new Queue('native-streaming', QUEUE_CONFIG);
export const queueEvents = new QueueEvents('native-streaming', { connection: redis });

// Text generator
const generateRandomText = (): string => {
  const words = [
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
    "hello", "world", "javascript", "typescript", "streaming", "bullmq",
    "queue", "job", "redis", "realtime", "distributed", "scalable"
  ];

  const wordCount = Math.floor(Math.random() * 3) + 1;
  return Array.from({ length: wordCount }, () =>
    words[Math.floor(Math.random() * words.length)]
  ).join(" ") + ". ";
};

// Stream job processor - uses native job progress
const processStreamJob = async (job: Job<StreamJobData>) => {
  const { streamId, type, intervalMs, maxChunks = 100 } = job.data;

  console.log(`🚀 Starting native stream job: ${streamId}`);

  // Initialize with start chunk
  const startChunk: StreamChunk = {
    type: 'start',
    streamId,
    chunkNumber: 0,
    timestamp: new Date().toISOString(),
    metadata: { jobId: job.id, type }
  };

  // BullMQ stores this progress automatically!
  await job.updateProgress([startChunk]);

  // Generate chunks
  for (let i = 1; i <= maxChunks; i++) {
    // Check if job should stop
    if (await job.isCompleted() || await job.isFailed()) {
      break;
    }

    let content = '';
    switch (type) {
      case 'demo':
        content = generateRandomText();
        break;
      case 'ai':
        content = `AI response ${i}: Simulated AI content. `;
        break;
      case 'custom':
        content = `Custom chunk ${i}. `;
        break;
    }

    const chunk: StreamChunk = {
      type: 'chunk',
      streamId,
      chunkNumber: i,
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        generatedAt: new Date().toISOString(),
        progress: Math.round((i / maxChunks) * 100)
      }
    };

    // Get current progress and append new chunk
    const currentProgress = (job.progress as StreamChunk[]) || [];
    const updatedProgress = [...currentProgress, chunk];

    // BullMQ automatically persists this and emits progress event!
    await job.updateProgress(updatedProgress);

    console.log(`📝 Native stream ${streamId}: Chunk ${i}/${maxChunks} - "${content.slice(0, 20)}..."`);

    // Wait between chunks
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Complete the stream
  const currentProgress = (job.progress as StreamChunk[]) || [];
  const completeChunk: StreamChunk = {
    type: 'complete',
    streamId,
    chunkNumber: currentProgress.length,
    timestamp: new Date().toISOString(),
    metadata: {
      totalChunks: currentProgress.length - 1, // -1 for start chunk
      duration: Date.now() - new Date(currentProgress[0]?.timestamp || new Date()).getTime()
    }
  };

  const finalProgress = [...currentProgress, completeChunk];
  await job.updateProgress(finalProgress);

  console.log(`✅ Native stream ${streamId} completed with ${currentProgress.length} chunks`);

  return {
    streamId,
    totalChunks: currentProgress.length,
    status: 'completed'
  };
};

// Create worker
export const streamWorker = new Worker('native-streaming', processStreamJob, {
  connection: redis,
  concurrency: 3,
});

streamWorker.on('completed', (job) => {
  console.log(`✅ Native job ${job.id} completed`);
});

streamWorker.on('failed', (job, err) => {
  console.error(`❌ Native job ${job?.id} failed:`, err.message);
});

// Native stream manager
export class NativeStreamManager {
  private static instance: NativeStreamManager;
  private activeStreams = new Map<string, string>(); // streamId -> jobId

  private constructor() { }

  static getInstance(): NativeStreamManager {
    if (!this.instance) {
      this.instance = new NativeStreamManager();
    }
    return this.instance;
  }

  async startStream(data: StreamJobData): Promise<{ jobId: string; streamId: string }> {
    const job = await streamQueue.add('process-stream', data, {
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.activeStreams.set(data.streamId, job.id!);

    console.log(`🎬 Started native stream: ${data.streamId} (job: ${job.id})`);
    return { jobId: job.id!, streamId: data.streamId };
  }

  async stopStream(streamId: string): Promise<boolean> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) return false;

    try {
      const job = await Job.fromId(streamQueue, jobId);
      if (job) {
        await job.remove();
        this.activeStreams.delete(streamId);
        console.log(`🛑 Stopped native stream: ${streamId}`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Error stopping stream ${streamId}:`, error);
    }
    return false;
  }

  async getStreamProgress(streamId: string): Promise<StreamChunk[] | null> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) return null;

    try {
      const job = await Job.fromId(streamQueue, jobId);
      if (job) {
        const progress = job.progress as StreamChunk[];
        return progress || null;
      }
    } catch (error) {
      console.error(`❌ Error getting progress for ${streamId}:`, error);
    }
    return null;
  }

  async getJobByStreamId(streamId: string): Promise<Job | null> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) return null;

    try {
      const job = await Job.fromId(streamQueue, jobId);
      return job || null;
    } catch (error) {
      console.error(`❌ Error getting job for ${streamId}:`, error);
      return null;
    }
  }

  getActiveStreams(): { streamId: string; jobId: string }[] {
    return Array.from(this.activeStreams.entries()).map(([streamId, jobId]) => ({
      streamId,
      jobId
    }));
  }

  generateStreamId(): string {
    return 'native-' + randomBytes(8).toString('hex');
  }
}

// Native stream emitter using BullMQ's native progress events
export class NativeStreamEmitter {
  private listeners = new Map<string, Set<(chunk: StreamChunk) => void>>();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Listen to native BullMQ progress events
    queueEvents.on('progress', ({ jobId, data }) => {
      const chunks = data as StreamChunk[] || [];
      const latestChunk = chunks[chunks.length - 1];

      if (latestChunk) {
        console.log(`📨 Native progress event - Job: ${jobId}, Chunk: ${latestChunk.chunkNumber}, Type: ${latestChunk.type}`);
        this.emitToListeners(latestChunk.streamId, latestChunk);
      }
    });

    // queueEvents.on('active', ({ jobId, prev }) => {
    //   console.log(`🔄 Native stream active - Job: ${jobId}, Previous: ${prev}`);
    // });

    queueEvents.on('completed', ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
      console.log(`✅ Native stream completed - Job: ${jobId}`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      console.error(`❌ Native stream failed - Job: ${jobId}, Reason: ${failedReason}`);
    });
  }

  // Subscribe to stream with automatic historical replay - returns async generator
  async *subscribeWithReplay(streamId: string): AsyncGenerator<StreamChunk, void, unknown> {
    console.log(`🎧 Native subscribe with replay: ${streamId}`);

    // Store unsubscribe function for cleanup
    let unsubscribe: (() => void) | null = null;

    // Create a ReadableStream that handles subscription in its start function
    const chunkStream = new ReadableStream<StreamChunk>({
      start: (controller) => {
        // Subscribe to new events FIRST to avoid missing messages during history iteration
        unsubscribe = this.subscribe(streamId, (chunk: StreamChunk) => {
          console.log(`📨 Native live chunk ${chunk.chunkNumber} for ${streamId}: ${chunk.type}`);

          controller.enqueue(chunk);

          // Close the stream when we get a terminal chunk
          if (chunk.type === 'complete' || chunk.type === 'error') {
            controller.close();
          }
        });
      }
    });

    try {
      // Now get and yield historical chunks AFTER we're listening for new ones
      const nativeStreamManager = NativeStreamManager.getInstance();
      const historicalChunks = await nativeStreamManager.getStreamProgress(streamId) || [];

      for (const chunk of historicalChunks) {
        console.log(`📺 Native historical chunk ${chunk.chunkNumber} for ${streamId}: ${chunk.type}`);
        yield chunk;
      }

      // Now use for-await to iterate through new chunks
      for await (const chunk of chunkStream) {
        console.log(`📤 Native yielding live chunk ${chunk.chunkNumber} for ${streamId}: ${chunk.type}`);
        yield chunk;

        if (chunk.type === 'complete' || chunk.type === 'error') {
          console.log(`🏁 Terminal chunk received for ${streamId}: ${chunk.type}`);
          break;
        }
      }

      console.log(`🏁 Native stream completed for ${streamId}`);
    } finally {
      if (unsubscribe) {
        (unsubscribe as () => void)();
      }
      console.log(`📡 Native subscription closed for ${streamId}`);
    }
  }

  // Subscribe to stream (real-time only)
  subscribe(streamId: string, listener: (chunk: StreamChunk) => void): () => void {
    if (!this.listeners.has(streamId)) {
      this.listeners.set(streamId, new Set());
    }

    this.listeners.get(streamId)!.add(listener);
    console.log(`🎧 Native subscribed to ${streamId}, total listeners: ${this.listeners.get(streamId)!.size}`);

    // Return unsubscribe function
    return () => {
      const streamListeners = this.listeners.get(streamId);
      if (streamListeners) {
        streamListeners.delete(listener);
        if (streamListeners.size === 0) {
          this.listeners.delete(streamId);
        }
      }
      console.log(`🔇 Native unsubscribed from ${streamId}`);
    };
  }

  private emitToListeners(streamId: string, chunk: StreamChunk) {
    const streamListeners = this.listeners.get(streamId);
    if (streamListeners && streamListeners.size > 0) {
      console.log(`📤 Native emitting to ${streamListeners.size} listeners for ${streamId}`);
      streamListeners.forEach(listener => {
        try {
          listener(chunk);
        } catch (error) {
          console.error(`❌ Native listener error for ${streamId}:`, error);
        }
      });
    }
  }
}

// Export singleton instances
export const nativeStreamManager = NativeStreamManager.getInstance();
export const nativeStreamEmitter = new NativeStreamEmitter();

// Cleanup on process exit
const cleanup = async () => {
  console.log('🧹 Cleaning up native BullMQ resources...');
  await streamQueue.close();
  await queueEvents.close();
  await streamWorker.close();
  await redis.quit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Export queue metrics
export const getNativeQueueMetrics = async () => {
  const waiting = await streamQueue.getWaiting();
  const active = await streamQueue.getActive();
  const completed = await streamQueue.getCompleted();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    activeStreams: nativeStreamManager.getActiveStreams()
  };
}; 