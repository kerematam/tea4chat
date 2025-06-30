/**
 * Stateless BullMQ Streaming Utilities
 * 
 * Utility functions for BullMQ streaming without singletons or local state.
 * Designed for cluster/serverless environments where state doesn't persist.
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

// Types
export interface StreamJobData {
  streamId: string;
  type: 'demo' | 'ai' | 'custom';
  intervalMs: number;
  maxChunks?: number;
  ownerId?: string;
  config?: Record<string, any>;
  shouldStop?: boolean;
  stoppedAt?: string;
}


export interface StreamChunk {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  chunkNumber: number;
  content?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Queue configuration
const QUEUE_CONFIG = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    // removeOnComplete: {
    //   age: 3600, // Keep completed jobs for 1 hour
    //   count: 100, // Keep max 100 completed jobs
    // },
    // removeOnFail: {
    //   age: 24 * 3600, // Keep failed jobs for 24 hours (debugging)
    //   count: 50, // Keep max 50 failed jobs
    // },
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
};

// Queue instances (shared across functions)
export const streamQueue = new Queue('stream-processing', QUEUE_CONFIG);
export const queueEvents = new QueueEvents('stream-processing', { connection: createRedisConnection() });

// Text generator utility
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

// Stream job processor
const processStreamJob = async (job: Job<StreamJobData>) => {
  const { streamId, type, intervalMs, maxChunks = 100 } = job.data;

  console.log(`🚀 Starting stream job: ${streamId}`);

  try {
    // Initialize with start chunk
    const startChunk: StreamChunk = {
      type: 'start',
      streamId,
      chunkNumber: 0,
      timestamp: new Date().toISOString(),
      metadata: { jobId: job.id, type }
    };

    await job.updateProgress([startChunk]);

    // Generate chunks
    for (let i = 1; i <= maxChunks; i++) {
      // Check for stop signal in job data (distributed across all workers)
      const currentJob = await Job.fromId(streamQueue, streamId);
      if (await job.isCompleted() || await job.isFailed() || currentJob?.data.shouldStop) {
        console.log(`🛑 Stop signal received for stream: ${streamId}`);
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

    const currentProgress = (job.progress as StreamChunk[]) || [];
    const updatedProgress = [...currentProgress, chunk];
    await job.updateProgress(updatedProgress);

    console.log(`📝 Stream ${streamId}: Chunk ${i}/${maxChunks}`);
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
        totalChunks: currentProgress.length - 1,
        duration: Date.now() - new Date(currentProgress[0]?.timestamp || new Date()).getTime()
      }
    };

    const finalProgress = [...currentProgress, completeChunk];
    await job.updateProgress(finalProgress);

    console.log(`✅ Stream ${streamId} completed`);

    return {
      streamId,
      totalChunks: currentProgress.length,
      status: 'completed'
    };
  } finally {
    // Cleanup complete
  }
};

// Worker instance
export const streamWorker = new Worker('stream-processing', processStreamJob, {
  connection: createRedisConnection(),
  concurrency: 3,
});

// Worker event handlers
streamWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

streamWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

// Utility functions (stateless)

/**
 * Generate a unique stream ID
 */
export function generateStreamId(): string {
  return `stream-${randomBytes(8).toString('hex')}-${Date.now()}`;
}

/**
 * Start a new stream
 */
export async function startStream(data: StreamJobData): Promise<{ jobId: string; streamId: string }> {
  const job = await streamQueue.add('process-stream', data, {
    jobId: data.streamId, // Use streamId as jobId for direct lookup
    removeOnComplete: true,
    removeOnFail: true,
  });

  console.log(`🎬 Started stream: ${data.streamId} (job: ${job.id})`);
  return { jobId: job.id!, streamId: data.streamId };
}

/**
 * Stop a stream by direct job lookup
 */
export async function stopStream(streamId: string): Promise<boolean> {
  try {
    // Get the job and update its data to signal stop (distributed via Redis)
    const job = await Job.fromId(streamQueue, streamId);
    
    if (job) {
      // Update job data with stop signal - this is distributed via Redis
      await job.updateData({
        ...job.data,
        shouldStop: true,
        stoppedAt: new Date().toISOString()
      });
      
      console.log(`🛑 Stop signal sent for stream: ${streamId}`);
      return true;
    }

    console.log(`⚠️ Stream ${streamId} not found`);
    return false;
  } catch (error) {
    console.error(`❌ Error stopping stream ${streamId}:`, error);
    return false;
  }
}

/**
 * Get active streams by querying BullMQ
 */
export async function getActiveStreams(): Promise<{ streamId: string; jobId: string }[]> {
  try {
    const activeJobs = await streamQueue.getActive();
    return activeJobs.map(job => ({
      streamId: job.data.streamId,
      jobId: job.id!
    }));
  } catch (error) {
    console.error(`❌ Error getting active streams:`, error);
    return [];
  }
}

/**
 * Subscribe to stream events with historical replay
 * Returns an async generator for streaming
 */
export async function* subscribeToStream(streamId: string): AsyncGenerator<StreamChunk, void, unknown> {
  console.log(`🎧 Subscribing to stream: ${streamId}`);

  let listener: (data: { jobId: string; data: unknown }) => void;
  let lastSeenChunkNumber = -1;

  // Listen for new chunks via QueueEvents
  const chunkStream = new ReadableStream<StreamChunk>({
    start: (controller) => {
      listener = ({ jobId, data }) => {
        if (jobId !== streamId) return;

        const chunks = Array.isArray(data) ? data as StreamChunk[] : [];
        chunks.forEach(chunk => {
          if (chunk.chunkNumber > lastSeenChunkNumber) {
            console.log(`📨 Chunk ${chunk.chunkNumber} for ${streamId}: ${chunk.type}`);
            controller.enqueue(chunk);
            lastSeenChunkNumber = chunk.chunkNumber;

            if (chunk.type === 'complete' || chunk.type === 'error') {
              controller.close();
            }
          }
        });
      };

      queueEvents.on('progress', listener);
    }
  });

  try {
    // Stream new chunks
    for await (const chunk of chunkStream) {
      console.log(`📤 Yielding live chunk ${chunk.chunkNumber} for ${streamId}: ${chunk.type}`);
      yield chunk;

      if (chunk.type === 'complete' || chunk.type === 'error') {
        console.log(`🏁 Terminal chunk received for ${streamId}: ${chunk.type}`);
        break;
      }
    }
  } finally {
    queueEvents.off('progress', listener!);
    console.log(`📡 Subscription closed for ${streamId}`);
  }
}

/**
 * Clean up inactive and stalled jobs
 */
export async function cleanupInactiveJobs() {
  try {
    // Clean stalled jobs (jobs that were active but worker died)
    const stalledJobs = await streamQueue.getJobs(['paused']);
    for (const job of stalledJobs) {
      console.log(`🧹 Cleaning stalled job: ${job.id}`);
      await job.remove();
    }

    // Clean old completed jobs beyond retention policy
    await streamQueue.clean(3600 * 1000, 100, 'completed'); // 1 hour, max 100
    
    // Clean old failed jobs beyond retention policy  
    await streamQueue.clean(24 * 3600 * 1000, 50, 'failed'); // 24 hours, max 50

    console.log(`🧹 Cleanup completed. Removed ${stalledJobs.length} stalled jobs`);
    return { removedStalled: stalledJobs.length };
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

/**
 * Get queue metrics
 */
export async function getQueueMetrics() {
  const [waiting, active, completed, failed, paused] = await Promise.all([
    streamQueue.getWaiting(),
    streamQueue.getActive(), 
    streamQueue.getCompleted(),
    streamQueue.getFailed(),
    streamQueue.getJobs(['paused'])
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    paused: paused.length,
    activeStreams: await getActiveStreams()
  };
}

/**
 * Start periodic cleanup of inactive jobs (call this once during app startup)
 */
export function startPeriodicCleanup(intervalMs: number = 30 * 60 * 1000) { // Default: 30 minutes
  const cleanupInterval = setInterval(async () => {
    try {
      await cleanupInactiveJobs();
    } catch (error) {
      console.error('❌ Periodic cleanup failed:', error);
    }
  }, intervalMs);

  // Return cleanup function to stop the interval
  return () => {
    clearInterval(cleanupInterval);
    console.log('🛑 Stopped periodic cleanup');
  };
}

// Cleanup on process exit
const cleanup = async () => {
  console.log('🧹 Cleaning up BullMQ resources...');
  await streamWorker.close();
  await streamQueue.close();
  await queueEvents.close();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);