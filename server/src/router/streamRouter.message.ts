/**
 * Message Chunk-based Stream Router
 * 
 * Uses MessageType structure from messageRouter.ts with BullMQ streaming.
 * Designed for streaming message chunks similar to sendWithStream pattern.
 */

import { z } from 'zod';
import {
    generateMessageChunkStreamId,
    getActiveMessageChunkStreams,
    getMessageChunkStreamMetrics,
    startMessageChunkStream,
    stopMessageChunkStream,
    subscribeToMessageChunkStream
} from '../lib/bullmq-message-utils';
import { withOwnerProcedure } from '../procedures/base';

export const messageStreamRouter = {
  // Start a new message chunk stream
  startMessageChunkStream: withOwnerProcedure
    .input(z.object({
      chatId: z.string().optional(),
      userContent: z.string().min(1, "User content is required"),
      type: z.enum(['demo', 'ai', 'conversation']).default('ai'),
      intervalMs: z.number().min(10).max(5000).default(200),
      maxChunks: z.number().min(1).max(500).default(15),
      config: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const streamId = generateMessageChunkStreamId();
      const chatId = input.chatId || `chat_${Date.now()}`;
      
      const result = await startMessageChunkStream({
        streamId,
        chatId,
        userContent: input.userContent,
        type: input.type,
        intervalMs: input.intervalMs,
        maxChunks: input.maxChunks,
        ownerId: ctx.owner.id,
        config: input.config,
      });

      return {
        ...result,
        message: `Started ${input.type} message chunk stream with ${input.maxChunks} chunks`,
        settings: {
          type: input.type,
          intervalMs: input.intervalMs,
          maxChunks: input.maxChunks,
          userContent: input.userContent,
        }
      };
    }),

  // Stop a message chunk stream
  stopMessageChunkStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const stopped = await stopMessageChunkStream(input.streamId);
      
      return {
        streamId: input.streamId,
        stopped,
        message: stopped ? 'Message chunk stream stopped successfully' : 'Message chunk stream not found or already completed'
      };
    }),

  // Get active message chunk streams
  getActiveMessageChunkStreams: withOwnerProcedure
    .query(async () => {
      const activeStreams = await getActiveMessageChunkStreams();
      
      return {
        streams: activeStreams,
        count: activeStreams.length,
        message: `Found ${activeStreams.length} active message chunk streams`
      };
    }),

  // Get message chunk stream queue metrics
  getMessageChunkStreamMetrics: withOwnerProcedure
    .query(async () => {
      return await getMessageChunkStreamMetrics();
    }),

  // Listen to message chunk stream - returns async generator like sendWithStream
  listenToMessageChunkStream: withOwnerProcedure
    .input(z.object({
      streamId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`🎧 User ${ctx.owner?.id} listening to message chunk stream: ${input.streamId}`);
      
      // Return the async generator from subscribeToMessageChunkStream
      return subscribeToMessageChunkStream(input.streamId);
    }),
}; 