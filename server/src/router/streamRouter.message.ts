/**
 * Redis-based Message Stream Router
 * 
 * Uses MessageType structure from messageRouter.ts with Redis streaming.
 * Designed for streaming message chunks similar to sendWithStream pattern.
 * Uses Redis sorted sets for history and pub/sub for real-time events.
 */

import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  getActiveMessageChunkStreams,
  getAllMessageChunkStreamMetrics,
  getMessageChunkStreamMetrics,
  startMessageChunkStream,
  stopMessageChunkStream,
  subscribeToMessageChunkStream
} from '../lib/redis-message-streaming';
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
      // Use provided chatId or generate a new one
      const chatId = input.chatId || `chat_${randomBytes(8).toString('hex')}_${Date.now()}`;
      
      const resultChatId = await startMessageChunkStream({
        chatId, // chatId serves as both streamId and jobId
        userContent: input.userContent,
        type: input.type,
        intervalMs: input.intervalMs,
        maxChunks: input.maxChunks,
        ownerId: ctx.owner.id,
        config: input.config,
      });

      return {
        chatId: resultChatId,
        streamId: resultChatId,
        message: `Started ${input.type} message chunk stream for chat ${chatId} with ${input.maxChunks} chunks`,
        settings: {
          type: input.type,
          intervalMs: input.intervalMs,
          maxChunks: input.maxChunks,
          userContent: input.userContent,
        }
      };
    }),

  // Stop a message chunk stream by chatId
  stopMessageChunkStream: withOwnerProcedure
    .input(z.object({
      chatId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const stopped = await stopMessageChunkStream(input.chatId);
      
      return {
        chatId: input.chatId,
        streamId: input.chatId, // streamId = chatId
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
    .input(z.object({
      chatId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.chatId) {
        // Get metrics for specific chat
        return await getMessageChunkStreamMetrics(input.chatId);
      } else {
        // Get metrics for all chats
        return await getAllMessageChunkStreamMetrics();
      }
    }),

  // Listen to message chunk stream by chatId - returns async generator like sendWithStream
  listenToMessageChunkStream: withOwnerProcedure
    .input(z.object({
      chatId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`🎧 User ${ctx.owner?.id} listening to message chunk stream for chat: ${input.chatId}`);
      
      // Return the async generator from subscribeToMessageChunkStream
      return subscribeToMessageChunkStream(input.chatId);
    }),
}; 