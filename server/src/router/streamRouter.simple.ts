/**
 * Simplified Stream Router using Native BullMQ Job Progress
 * 
 * This router uses BullMQ's built-in job progress system for event
 * persistence and replay, eliminating the need for custom Redis storage.
 */

import { z } from 'zod';
import {
  getQueueMetrics,
  simpleStreamEmitter,
  simpleStreamManager,
  type StreamChunk,
  type StreamJobData
} from '../lib/bullmq-streams-simple';
import { adminProcedure, withOwnerProcedure } from '../procedures';
import { router } from '../trpc';

export const simpleStreamRouter = router({
  // Start a new stream
  startStream: withOwnerProcedure
    .input(z.object({
      type: z.enum(['demo', 'ai', 'custom']).default('demo'),
      intervalMs: z.number().min(10).max(10000).default(1000),
      maxChunks: z.number().min(1).max(1000).default(20),
      config: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const streamId = simpleStreamManager.generateStreamId();
      
      const streamData: StreamJobData = {
        streamId,
        type: input.type,
        intervalMs: input.intervalMs,
        maxChunks: input.maxChunks,
        ownerId: ctx.owner?.id,
        config: input.config,
      };

      const result = await simpleStreamManager.startStream(streamData);

      console.log(`🚀 Stream started by user ${ctx.owner?.id}: ${streamId}`);

      return {
        ...result,
        message: `Stream ${streamId} started successfully`,
      };
    }),

  // Stop a stream
  stopStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const success = await simpleStreamManager.stopStream(input.streamId);
      
      if (success) {
        console.log(`⏹️ Stream stopped by user ${ctx.owner?.id}: ${input.streamId}`);
        return { 
          success: true, 
          message: `Stream ${input.streamId} stopped successfully` 
        };
      } else {
        throw new Error(`Failed to stop stream ${input.streamId}`);
      }
    }),


  // Get active streams
  getActiveStreams: withOwnerProcedure
    .query(async () => {
      const streams = simpleStreamManager.getActiveStreams();
      return {
        streams,
        count: streams.length,
      };
    }),

  // Get queue metrics
  getQueueMetrics: adminProcedure
    .query(async () => {
      const metrics = await getQueueMetrics();
      return {
        metrics,
        timestamp: new Date().toISOString(),
      };
    }),

  // Listen to stream - returns async generator that yields events (like sendWithStream)
  listenToStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`🎧 User ${ctx.owner?.id} listening to stream: ${input.streamId}`);
      
      return (async function* () {
        let lastSeenChunkNumber = 0;
        let unsubscribe: (() => void) | null = null;
        
        try {
          // START LISTENING IMMEDIATELY to avoid race conditions
          const chunkQueue: StreamChunk[] = [];
          let streamCompleted = false;
          let resolveNext: ((value: { chunk: StreamChunk | null; done: boolean }) => void) | null = null;

          const waitForNextChunk = (): Promise<{ chunk: StreamChunk | null; done: boolean }> => {
            return new Promise((resolve) => {
              if (chunkQueue.length > 0) {
                const chunk = chunkQueue.shift()!;
                resolve({ chunk, done: false });
                return;
              }
              
              if (streamCompleted) {
                resolve({ chunk: null, done: true });
                return;
              }
              
              resolveNext = resolve;
            });
          };

          // Subscribe to new events from BullMQ BEFORE fetching historical data
          unsubscribe = simpleStreamEmitter.subscribe(input.streamId, (chunk: StreamChunk) => {
            if (chunk.chunkNumber > lastSeenChunkNumber) {
              console.log(`📨 New chunk ${chunk.chunkNumber} for ${input.streamId}: ${chunk.type}`);
              
              chunkQueue.push(chunk);
              
              if (resolveNext) {
                const nextChunk = chunkQueue.shift()!;
                resolveNext({ chunk: nextChunk, done: false });
                resolveNext = null;
              }
              
              if (chunk.type === 'complete' || chunk.type === 'error') {
                streamCompleted = true;
                if (resolveNext && chunkQueue.length === 0) {
                  resolveNext({ chunk: null, done: true });
                  resolveNext = null;
                }
              }
              
              lastSeenChunkNumber = chunk.chunkNumber;
            }
          });

          // PHASE 1: REPLAY - Yield all existing chunks first
          const progress = await simpleStreamManager.getStreamProgress(input.streamId);
          
          if (progress && progress.chunks.length > 0) {
            console.log(`📦 Yielding ${progress.chunks.length} historical chunks for ${input.streamId}`);
            
            // Yield all historical chunks one by one
            for (const chunk of progress.chunks) {
              yield chunk;
              lastSeenChunkNumber = Math.max(lastSeenChunkNumber, chunk.chunkNumber);
            }
            
            console.log(`✅ Historical replay completed for ${input.streamId}, last chunk: ${lastSeenChunkNumber}`);
          } else {
            console.log(`📭 No historical chunks found for ${input.streamId}`);
          }

          // PHASE 2: LIVE STREAM - Yield new chunks that arrived during/after replay
          // (The subscription is already active and collecting chunks in the queue)
          while (true) {
            const { chunk, done } = await waitForNextChunk();
            
            if (done || chunk === null) {
              console.log(`🏁 Stream completed for ${input.streamId}`);
              break;
            }
            
            yield chunk;
            
            if (chunk.type === 'complete' || chunk.type === 'error') {
              console.log(`🏁 Terminal chunk received for ${input.streamId}: ${chunk.type}`);
              break;
            }

            console.log("chunk", chunk);
          }

        } catch (error) {
          console.error(`❌ Stream error for ${input.streamId}:`, error);
          throw error;
        } finally {
          if (unsubscribe) {
            unsubscribe();
          }
          console.log(`📡 Event stream closed for ${input.streamId}`);
        }
      })();
    }),
}); 