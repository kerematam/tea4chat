/**
 * Utility-based Stream Router
 * 
 * Uses stateless utility functions instead of classes/singletons.
 * Better suited for cluster/serverless environments.
 */

import { z } from 'zod';
import { 
  generateStreamId, 
  startStream, 
  stopStream, 
  getActiveStreams, 
  getQueueMetrics,
  subscribeToStream 
} from '../lib/bullmq-utils';
import { withOwnerProcedure } from '../procedures/base';

export const nativeStreamRouter = {
  // Start a new stream
  startStream: withOwnerProcedure
    .input(z.object({
      type: z.enum(['demo', 'ai', 'custom']).default('demo'),
      intervalMs: z.number().min(10).max(5000).default(100),
      maxChunks: z.number().min(1).max(1000).default(100),
      config: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const streamId = generateStreamId();
      
      const result = await startStream({
        streamId,
        type: input.type,
        intervalMs: input.intervalMs,
        maxChunks: input.maxChunks,
        ownerId: ctx.owner.id,
        config: input.config,
      });

      return {
        ...result,
        message: `Started ${input.type} stream with ${input.maxChunks} chunks`,
        settings: {
          type: input.type,
          intervalMs: input.intervalMs,
          maxChunks: input.maxChunks,
        }
      };
    }),

  // Stop a stream
  stopStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const stopped = await stopStream(input.streamId);
      
      return {
        streamId: input.streamId,
        stopped,
        message: stopped ? 'Stream stopped successfully' : 'Stream not found or already completed'
      };
    }),

  // Get active streams
  getActiveStreams: withOwnerProcedure
    .query(async () => {
      const activeStreams = await getActiveStreams();
      
      return {
        streams: activeStreams,
        count: activeStreams.length,
        message: `Found ${activeStreams.length} active streams`
      };
    }),

  // Get queue metrics
  getMetrics: withOwnerProcedure
    .query(async () => {
      return await getQueueMetrics();
    }),

  // Listen to stream - returns async generator
  listenToStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`🎧 User ${ctx.owner?.id} listening to stream: ${input.streamId}`);
      
      // Return the async generator from subscribeToStream
      return subscribeToStream(input.streamId);
    }),
}; 