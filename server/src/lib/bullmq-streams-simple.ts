/**
 * Simplified BullMQ Streaming using Native Job Progress
 * 
 * Uses BullMQ's built-in job progress storage for event persistence
 * and replay functionality. No custom Redis implementation needed.
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

// Stream job data interfaces
export interface StreamJobData {
  streamId: string;
  type: 'demo' | 'ai' | 'custom';
  intervalMs: number;
  maxChunks?: number;
  ownerId?: string;
  config?: Record<string, any>;
}

export interface StreamChunk {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  chunkNumber: number;
  content?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface StreamProgress {
  chunks: StreamChunk[];
  currentChunk: number;
  totalChunks: number;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// BullMQ Queue Configuration
const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep more completed jobs for history
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
};

// Create queues
export const streamQueue = new Queue('simple-streaming', QUEUE_CONFIG);
export const queueEvents = new QueueEvents('simple-streaming', { connection: redis });

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
  
  console.log(`🚀 Starting stream job: ${streamId}`);
  
  // Initialize progress with start chunk
  const startChunk: StreamChunk = {
    type: 'start',
    streamId,
    chunkNumber: 0,
    timestamp: new Date().toISOString(),
    metadata: { jobId: job.id, type }
  };
  
  const progress: StreamProgress = {
    chunks: [startChunk],
    currentChunk: 0,
    totalChunks: maxChunks,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  
  // Update job progress (BullMQ stores this automatically!)
  await job.updateProgress(progress);

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

    // Add chunk to progress and update job
    progress.chunks.push(chunk);
    progress.currentChunk = i;
    
    // BullMQ automatically persists this progress!
    await job.updateProgress(progress);

    console.log(`📝 Stream ${streamId}: Chunk ${i}/${maxChunks} - "${content.slice(0, 20)}..."`);

    // Wait between chunks
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Complete the stream
  const completeChunk: StreamChunk = {
    type: 'complete',
    streamId,
    chunkNumber: progress.currentChunk + 1,
    timestamp: new Date().toISOString(),
    metadata: { 
      totalChunks: progress.currentChunk,
      duration: Date.now() - new Date(progress.startedAt).getTime()
    }
  };

  progress.chunks.push(completeChunk);
  progress.status = 'completed';
  progress.completedAt = new Date().toISOString();
  
  await job.updateProgress(progress);

  console.log(`✅ Stream ${streamId} completed with ${progress.currentChunk} chunks`);
  
  return {
    streamId,
    totalChunks: progress.currentChunk,
    status: 'completed'
  };
};

// Create worker
export const streamWorker = new Worker('simple-streaming', processStreamJob, {
  connection: redis,
  concurrency: 3,
});

streamWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

streamWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

// Simple stream manager
export class SimpleStreamManager {
  private static instance: SimpleStreamManager;
  private activeStreams = new Map<string, string>(); // streamId -> jobId

  private constructor() {}

  static getInstance(): SimpleStreamManager {
    if (!SimpleStreamManager.instance) {
      SimpleStreamManager.instance = new SimpleStreamManager();
    }
    return SimpleStreamManager.instance;
  }

  /**
   * Start a new stream
   */
  async startStream(data: StreamJobData): Promise<{ jobId: string; streamId: string }> {
    if (this.activeStreams.has(data.streamId)) {
      throw new Error(`Stream ${data.streamId} is already active`);
    }

    const job = await streamQueue.add(`stream-${data.streamId}`, data);
    this.activeStreams.set(data.streamId, job.id!);

    console.log(`🚀 Started stream: ${data.streamId} (Job: ${job.id})`);

    return {
      jobId: job.id!,
      streamId: data.streamId,
    };
  }

  /**
   * Stop a stream
   */
  async stopStream(streamId: string): Promise<boolean> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) {
      throw new Error(`Stream ${streamId} not found`);
    }

    try {
      const job = await Job.fromId(streamQueue, jobId);
      if (job) {
        await job.remove();
      }
      this.activeStreams.delete(streamId);
      return true;
    } catch (error) {
      console.error(`Failed to stop stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Get stream job and its full progress history
   */
  async getStreamProgress(streamId: string): Promise<StreamProgress | null> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) {
      // Try to find completed job by searching recent jobs
      const completed = await streamQueue.getCompleted(0, 49);
      for (const job of completed) {
        if (job.data.streamId === streamId && job.progress) {
          return job.progress as StreamProgress;
        }
      }
      return null;
    }

    try {
      const job = await Job.fromId(streamQueue, jobId);
      if (!job) {
        this.activeStreams.delete(streamId);
        return null;
      }

      // Return the job's current progress (contains all chunks!)
      return (job.progress as StreamProgress) || null;
    } catch (error) {
      console.error(`Failed to get progress for ${streamId}:`, error);
      return null;
    }
  }

  /**
   * Get job by stream ID
   */
  async getJobByStreamId(streamId: string): Promise<Job | null> {
    const jobId = this.activeStreams.get(streamId);
    if (jobId) {
      try {
        const job = await Job.fromId(streamQueue, jobId);
        return job || null;
      } catch (error) {
        return null;
      }
    }

    // Search in completed jobs
    const completed = await streamQueue.getCompleted(0, 49);
    for (const job of completed) {
      if (job.data.streamId === streamId) {
        return job;
      }
    }
    return null;
  }

  getActiveStreams(): { streamId: string; jobId: string }[] {
    return Array.from(this.activeStreams.entries()).map(([streamId, jobId]) => ({
      streamId,
      jobId,
    }));
  }

  generateStreamId(): string {
    return `stream-${randomBytes(6).toString("hex")}-${Date.now()}`;
  }
}

export const simpleStreamManager = SimpleStreamManager.getInstance();

// Simple event emitter using native BullMQ events
export class SimpleStreamEmitter {
  private listeners = new Map<string, Set<(chunk: StreamChunk) => void>>();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Listen to job progress updates
    queueEvents.on('progress', ({ jobId, data }) => {
      if (data && typeof data === 'object' && 'chunks' in data) {
        const progress = data as StreamProgress;
        
        // Emit the latest chunk to listeners
        if (progress.chunks.length > 0) {
          const latestChunk = progress.chunks[progress.chunks.length - 1];
          const firstChunk = progress.chunks[0];
          if (latestChunk && firstChunk) {
            this.emitToListeners(firstChunk.streamId, latestChunk);
          }
        }
      }
    });
  }

  /**
   * Subscribe to stream with automatic replay
   */
  async subscribeWithReplay(streamId: string, listener: (chunk: StreamChunk) => void): Promise<() => void> {
    // First, get existing progress and replay all chunks
    console.log(`🔄 Getting stored progress for stream ${streamId}`);
    const progress = await simpleStreamManager.getStreamProgress(streamId);
    
    if (progress && progress.chunks.length > 0) {
      console.log(`📦 Replaying ${progress.chunks.length} chunks for ${streamId}`);
      for (const chunk of progress.chunks) {
        try {
          listener(chunk);
        } catch (error) {
          console.error('Error replaying chunk:', error);
        }
      }
      console.log(`✅ Replay completed for ${streamId}`);
    } else {
      console.log(`📭 No stored chunks found for ${streamId}`);
    }

    // Then subscribe to new chunks
    return this.subscribe(streamId, listener);
  }

  subscribe(streamId: string, listener: (chunk: StreamChunk) => void): () => void {
    if (!this.listeners.has(streamId)) {
      this.listeners.set(streamId, new Set());
    }
    
    this.listeners.get(streamId)!.add(listener);

    return () => {
      const streamListeners = this.listeners.get(streamId);
      if (streamListeners) {
        streamListeners.delete(listener);
        if (streamListeners.size === 0) {
          this.listeners.delete(streamId);
        }
      }
    };
  }

  private emitToListeners(streamId: string, chunk: StreamChunk) {
    const streamListeners = this.listeners.get(streamId);
    if (streamListeners) {
      streamListeners.forEach(listener => {
        try {
          listener(chunk);
        } catch (error) {
          console.error('Error in stream listener:', error);
        }
      });
    }
  }
}

export const simpleStreamEmitter = new SimpleStreamEmitter();

// Cleanup
const cleanup = async () => {
  console.log('Shutting down simple streaming...');
  await streamWorker.close();
  await streamQueue.close();
  await queueEvents.close();
  redis.disconnect();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export const getQueueMetrics = async () => {
  const waiting = await streamQueue.getWaiting();
  const active = await streamQueue.getActive();
  const completed = await streamQueue.getCompleted();
  const failed = await streamQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  };
}; 