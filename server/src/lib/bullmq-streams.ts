/**
 * BullMQ Streaming Infrastructure with Event Replay
 * 
 * Provides job-based streaming with real-time progress events,
 * automatic retries, cross-instance coordination, and event replay
 * for new listeners.
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

export interface StreamChunkData {
  content: string;
  chunkNumber: number;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface StreamProgress {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  chunkNumber?: number;
  totalChunks?: number;
  data?: StreamChunkData | any; // Allow flexible data for different event types
  error?: string;
  timestamp: string;
  progress?: {
    current: number;
    total?: number;
    percentage?: number;
  };
}

export interface StreamEventData {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  jobId: string;
  data?: any;
  error?: string;
  timestamp: string;
  progress?: {
    current: number;
    total?: number;
    percentage?: number;
  };
}

// BullMQ Queue Configuration
const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 5,      // Keep last 5 failed jobs
    attempts: 3,          // Retry failed jobs 3 times
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
};

// Create queues
export const streamQueue = new Queue('stream-processing', QUEUE_CONFIG);
export const queueEvents = new QueueEvents('stream-processing', { connection: redis });

// Event storage utilities
export class StreamEventStore {
  private static instance: StreamEventStore;
  
  private constructor() {}
  
  static getInstance(): StreamEventStore {
    if (!StreamEventStore.instance) {
      StreamEventStore.instance = new StreamEventStore();
    }
    return StreamEventStore.instance;
  }

  /**
   * Store a stream event in Redis
   */
  async storeEvent(streamId: string, event: StreamEventData): Promise<void> {
    try {
      const key = `stream:events:${streamId}`;
      const eventData = JSON.stringify({
        ...event,
        storedAt: new Date().toISOString(),
      });
      
      // Store in Redis list (LPUSH for newest first, but we want oldest first for replay)
      await redis.rpush(key, eventData);
      
      // Set TTL for the event list (e.g., 1 hour)
      await redis.expire(key, 3600);
      
      console.log(`📦 Stored event for stream ${streamId}: ${event.type}`);
    } catch (error) {
      console.error(`❌ Failed to store event for stream ${streamId}:`, error);
    }
  }

  /**
   * Get all stored events for a stream
   */
  async getStoredEvents(streamId: string): Promise<StreamEventData[]> {
    try {
      const key = `stream:events:${streamId}`;
      const eventStrings = await redis.lrange(key, 0, -1);
      
      const events = eventStrings.map(eventStr => {
        try {
          const parsed = JSON.parse(eventStr);
          // Remove the storedAt field before returning
          delete parsed.storedAt;
          return parsed as StreamEventData;
        } catch (error) {
          console.error('Failed to parse stored event:', error);
          return null;
        }
      }).filter(Boolean) as StreamEventData[];
      
      console.log(`📦 Retrieved ${events.length} stored events for stream ${streamId}`);
      return events;
    } catch (error) {
      console.error(`❌ Failed to get stored events for stream ${streamId}:`, error);
      return [];
    }
  }

  /**
   * Clear stored events for a stream
   */
  async clearEvents(streamId: string): Promise<void> {
    try {
      const key = `stream:events:${streamId}`;
      await redis.del(key);
      console.log(`🗑️ Cleared stored events for stream ${streamId}`);
    } catch (error) {
      console.error(`❌ Failed to clear events for stream ${streamId}:`, error);
    }
  }

  /**
   * Get event count for a stream
   */
  async getEventCount(streamId: string): Promise<number> {
    try {
      const key = `stream:events:${streamId}`;
      return await redis.llen(key);
    } catch (error) {
      console.error(`❌ Failed to get event count for stream ${streamId}:`, error);
      return 0;
    }
  }
}

// Export singleton instance
export const streamEventStore = StreamEventStore.getInstance();

// Random text generator for demo streams
const generateRandomText = (): string => {
  const words = [
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
    "hello", "world", "javascript", "typescript", "streaming", "bullmq",
    "queue", "job", "redis", "realtime", "websocket", "connection", "data", "flow",
    "awesome", "amazing", "incredible", "wonderful", "fantastic",
    "coding", "programming", "development", "software", "engineering",
    "distributed", "scalable", "resilient", "monitoring", "performance"
  ];
  
  const wordCount = Math.floor(Math.random() * 5) + 1; // 1-5 words
  return Array.from({ length: wordCount }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(" ") + ". ";
};

// Stream job processor
const processStreamJob = async (job: Job<StreamJobData>) => {
  const { streamId, type, intervalMs, maxChunks = 5000, config } = job.data;
  
  console.log(`Starting stream job: ${streamId} (${type})`);
  
  // Emit start event
  const startEvent = {
    type: 'start',
    streamId,
    jobId: job.id!,
    timestamp: new Date().toISOString(),
  } as StreamProgress;
  
  await job.updateProgress(startEvent);

  let chunkCount = 0;
  const startTime = Date.now();

  // Stream processing loop
  while (chunkCount < maxChunks) {
    // Check if job is cancelled
    if (await job.isCompleted() || await job.isFailed()) {
      console.log(`Stream job ${streamId} was cancelled or failed`);
      break;
    }

    chunkCount++;
    let content = '';
    
    // Generate content based on stream type
    switch (type) {
      case 'demo':
        content = generateRandomText();
        break;
      case 'ai':
        content = `AI chunk ${chunkCount}: This is simulated AI content. `;
        break;
      case 'custom':
        content = config?.customText || `Custom chunk ${chunkCount}. `;
        break;
      default:
        content = `Default chunk ${chunkCount}. `;
    }

    const chunkData: StreamChunkData = {
      content,
      chunkNumber: chunkCount,
      metadata: {
        generatedAt: new Date().toISOString(),
        type,
        jobId: job.id,
      },
      timestamp: new Date().toISOString(),
    };

    // Calculate progress
    const progress = {
      current: chunkCount,
      total: maxChunks,
      percentage: Math.round((chunkCount / maxChunks) * 100),
    };

    // Emit chunk event
    const chunkEvent = {
      type: 'chunk',
      streamId,
      jobId: job.id!,
      data: chunkData,
      timestamp: new Date().toISOString(),
      progress,
    } as StreamProgress;
    
    await job.updateProgress(chunkEvent);

    console.log(`Stream ${streamId}: Generated chunk ${chunkCount}/${maxChunks}`);

    // Wait for interval (simulate streaming delay)
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Emit completion event
  const duration = Date.now() - startTime;
  const completeEvent = {
    type: 'complete',
    streamId,
    jobId: job.id!,
    timestamp: new Date().toISOString(),
    data: {
      totalChunks: chunkCount,
      duration,
      completedAt: new Date().toISOString(),
    },
  } as StreamProgress;
  
  await job.updateProgress(completeEvent);

  console.log(`Stream job ${streamId} completed: ${chunkCount} chunks in ${duration}ms`);
  
  return {
    streamId,
    totalChunks: chunkCount,
    duration,
    status: 'completed',
  };
};

// Create worker to process stream jobs
export const streamWorker = new Worker('stream-processing', processStreamJob, {
  connection: redis,
  concurrency: 5, // Process up to 5 streams concurrently
});

// Worker event handlers
streamWorker.on('completed', (job) => {
  console.log(`✅ Stream job ${job.id} completed:`, job.returnvalue);
});

streamWorker.on('failed', (job, err) => {
  console.error(`❌ Stream job ${job?.id} failed:`, err.message);
});

streamWorker.on('progress', (job, progress) => {
  console.log(`📊 Stream job ${job.id} progress:`, progress);
});

// Stream management utilities
export class BullMQStreamManager {
  private static instance: BullMQStreamManager;
  private activeStreams = new Map<string, string>(); // streamId -> jobId mapping

  private constructor() {}

  static getInstance(): BullMQStreamManager {
    if (!BullMQStreamManager.instance) {
      BullMQStreamManager.instance = new BullMQStreamManager();
    }
    return BullMQStreamManager.instance;
  }

  /**
   * Start a new stream
   */
  async startStream(data: StreamJobData): Promise<{ jobId: string; streamId: string }> {
    // Check if stream is already active
    if (this.activeStreams.has(data.streamId)) {
      throw new Error(`Stream ${data.streamId} is already active`);
    }

    // Clear any old stored events for this stream
    await streamEventStore.clearEvents(data.streamId);

    // Add job to queue
    const job = await streamQueue.add(`stream-${data.streamId}`, data, {
      jobId: `${data.streamId}-${Date.now()}`,
      delay: 0,
    });

    // Track active stream
    this.activeStreams.set(data.streamId, job.id!);

    console.log(`🚀 Started stream: ${data.streamId} (Job: ${job.id})`);

    return {
      jobId: job.id!,
      streamId: data.streamId,
    };
  }

  /**
   * Stop an active stream
   */
  async stopStream(streamId: string): Promise<boolean> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) {
      throw new Error(`Stream ${streamId} not found or not active`);
    }

    try {
      // Remove job from queue
      const job = await Job.fromId(streamQueue, jobId);
      if (job) {
        await job.remove();
        console.log(`🛑 Stopped stream: ${streamId} (Job: ${jobId})`);
      }

      // Remove from active streams
      this.activeStreams.delete(streamId);
      return true;
    } catch (error) {
      console.error(`Failed to stop stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Get stream status
   */
  async getStreamStatus(streamId: string): Promise<any> {
    const jobId = this.activeStreams.get(streamId);
    if (!jobId) {
      return null;
    }

    try {
      const job = await Job.fromId(streamQueue, jobId);
      if (!job) {
        this.activeStreams.delete(streamId);
        return null;
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        streamId,
        jobId,
        state,
        progress,
        data: job.data,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        createdAt: new Date(job.timestamp),
      };
    } catch (error) {
      console.error(`Failed to get stream status for ${streamId}:`, error);
      return null;
    }
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): { streamId: string; jobId: string }[] {
    return Array.from(this.activeStreams.entries()).map(([streamId, jobId]) => ({
      streamId,
      jobId,
    }));
  }

  /**
   * Generate unique stream ID
   */
  generateStreamId(): string {
    return `stream-${randomBytes(8).toString("hex")}-${Date.now()}`;
  }

  /**
   * Clean up completed streams
   */
  async cleanup(): Promise<void> {
    for (const [streamId, jobId] of this.activeStreams.entries()) {
      try {
        const job = await Job.fromId(streamQueue, jobId);
        if (!job || await job.isCompleted() || await job.isFailed()) {
          this.activeStreams.delete(streamId);
        }
      } catch (error) {
        // Job not found, remove from active streams
        this.activeStreams.delete(streamId);
      }
    }
  }
}

// Export singleton instance
export const streamManager = BullMQStreamManager.getInstance();

// Stream event emitter for real-time updates with replay support
export class StreamEventEmitter {
  private listeners = new Map<string, Set<(event: StreamEventData) => void>>();

  constructor() {
    this.setupQueueEventListeners();
  }

  private setupQueueEventListeners() {
    // Listen to job progress events
    queueEvents.on('progress', async ({ jobId, data: progress }) => {
      if (progress && typeof progress === 'object' && 'streamId' in progress) {
        const streamProgress = progress as StreamProgress;
        const event: StreamEventData = {
          type: streamProgress.type,
          streamId: streamProgress.streamId,
          jobId,
          data: streamProgress.data,
          error: streamProgress.error,
          timestamp: streamProgress.timestamp,
          progress: streamProgress.progress,
        };

        // Store the event for replay
        await streamEventStore.storeEvent(streamProgress.streamId, event);

        // Emit to current listeners
        this.emitToListeners(streamProgress.streamId, event);
      }
    });

    // Listen to job completion
    queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      if (returnvalue && typeof returnvalue === 'object' && 'streamId' in returnvalue) {
        const jobResult = returnvalue as { streamId: string; totalChunks: number; duration: number; status: string };
        const event: StreamEventData = {
          type: 'complete',
          streamId: jobResult.streamId,
          jobId,
          data: jobResult,
          timestamp: new Date().toISOString(),
        };

        // Store the event for replay
        await streamEventStore.storeEvent(jobResult.streamId, event);

        // Emit to current listeners
        this.emitToListeners(jobResult.streamId, event);
      }
    });

    // Listen to job failures
    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      // Extract streamId from job (we'll need to get this from active streams)
      const activeStreams = streamManager.getActiveStreams();
      const stream = activeStreams.find(s => s.jobId === jobId);
      
      if (stream) {
        const event: StreamEventData = {
          type: 'error',
          streamId: stream.streamId,
          jobId,
          error: failedReason,
          timestamp: new Date().toISOString(),
        };

        // Store the event for replay
        await streamEventStore.storeEvent(stream.streamId, event);

        // Emit to current listeners
        this.emitToListeners(stream.streamId, event);
      }
    });
  }

  /**
   * Subscribe to stream events with replay support
   */
  async subscribeWithReplay(streamId: string, listener: (event: StreamEventData) => void): Promise<() => void> {
    // First, replay all stored events
    console.log(`🔄 Replaying stored events for stream ${streamId}`);
    const storedEvents = await streamEventStore.getStoredEvents(streamId);
    
    for (const event of storedEvents) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error replaying event:', error);
      }
    }
    
    console.log(`✅ Replayed ${storedEvents.length} events for stream ${streamId}`);

    // Then subscribe to new events
    return this.subscribe(streamId, listener);
  }

  /**
   * Subscribe to stream events (new events only)
   */
  subscribe(streamId: string, listener: (event: StreamEventData) => void): () => void {
    if (!this.listeners.has(streamId)) {
      this.listeners.set(streamId, new Set());
    }
    
    this.listeners.get(streamId)!.add(listener);

    // Return unsubscribe function
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

  private emitToListeners(streamId: string, event: StreamEventData) {
    const streamListeners = this.listeners.get(streamId);
    if (streamListeners) {
      streamListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in stream event listener:', error);
        }
      });
    }
  }
}

// Export singleton event emitter
export const streamEventEmitter = new StreamEventEmitter();

// Cleanup on shutdown
const cleanup = async () => {
  console.log('Shutting down BullMQ streams...');
  await streamWorker.close();
  await streamQueue.close();
  await queueEvents.close();
  redis.disconnect();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Queue monitoring utilities
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
    totalJobs: waiting.length + active.length + completed.length + failed.length,
  };
}; 