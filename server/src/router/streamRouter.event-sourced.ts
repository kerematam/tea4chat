import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { streamHelpers, redisPubSub } from "../lib/redis.event-sourcing";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { createStreamListener } from "../lib/stream-listener.js";

export const STREAM_TTL = 30;

// we kill streams that have not been updated in 5 seconds ONLY ON NEW STREAM
// CREATION. This might happen if the stream is broken and user is trying to
// recreate it, so we need to kill it quickly. Keep it shorter than STREAM_TTL.
// Since they will already be cleaned up by redis with STREAM_TTL.
export const STALE_STREAM_TIMEOUT = 5; 

// Types for stream data
export type StreamChunk = {
  type: "start" | "chunk" | "complete" | "error";
  streamId: string;
  data?: object;
  timestamp: string;
  error?: string;
  eventId?: string;
};

// Simple in-memory store for active intervals
const activeStreams = new Map<string, NodeJS.Timeout>();

// Random text generator for demo
const generateRandomText = (): string => {
  const words = [
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
    "hello", "world", "javascript", "typescript", "streaming", "redis",
    "pubsub", "realtime", "websocket", "connection", "data", "flow",
    "awesome", "amazing", "incredible", "wonderful", "fantastic",
    "coding", "programming", "development", "software", "engineering"
  ];
  
  const wordCount = Math.floor(Math.random() * 5) + 1; // 1-5 words
  return Array.from({ length: wordCount }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(" ") + ". ";
};

// Simple cleanup on server shutdown
const cleanup = () => {
  console.log(`Cleaning up ${activeStreams.size} active streams...`);
  activeStreams.forEach((interval) => clearInterval(interval));
  activeStreams.clear();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export const streamRouterEventSourced = router({
  // Create or stop a stream
  manageStream: withOwnerProcedure
    .input(
      z.object({
        streamId: z.string(),
        action: z.enum(["start", "stop"]),
        intervalMs: z.number().min(10).max(5000).default(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { streamId, action, intervalMs } = input;

      if (action === "start") {
        // Smart stream recreation logic
        if (activeStreams.has(streamId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Stream already active in memory",
          });
        }

        // Check if stream exists in Redis and apply smart recreation rules
        const existingMeta = await streamHelpers.getStreamMeta(streamId);
        if (existingMeta) {
          // Get the last event to check completion status
          const events = await streamHelpers.getStreamEvents(streamId);
          const lastEvent = events[events.length - 1];
          
          if (lastEvent?.type === 'complete') {
            // Stream is complete, clean up previous events before recreation
            console.log(`Stream ${streamId} is complete, cleaning up previous events before recreation`);
            
            try {
              // Clean up all previous events from completed stream
              await streamHelpers.cleanup.deleteStream(streamId);
              console.log(`Cleaned up completed stream ${streamId} before recreation`);
            } catch (error) {
              console.error(`Error cleaning up completed stream ${streamId}:`, error);
              // Continue with recreation even if cleanup fails
            }
          } else {
            // Stream is not complete, check timeout
            const lastActivity = existingMeta.lastActivity || existingMeta.startedAt;
            const timeSinceLastActivity = Date.now() - new Date(lastActivity).getTime();
            const timeoutMs = STALE_STREAM_TIMEOUT * 1000;
            
            if (timeSinceLastActivity < timeoutMs) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Stream exists and is not complete. Wait ${Math.ceil((timeoutMs - timeSinceLastActivity) / 1000)}s or until completion.`,
              });
            } else {
              console.log(`Stream ${streamId} timed out (${Math.round(timeSinceLastActivity / 1000)}s > ${STALE_STREAM_TIMEOUT}s), allowing recreation`);
            }
          }
        }

        // Create stream using event sourcing (no state accumulation)
        await streamHelpers.createStream(streamId, {
          type: "demo",
          intervalMs,
          ownerId: ctx.owner?.id,
        });

        let chunkCount = 0;

        // Start streaming - each chunk is a separate event
        const interval = setInterval(async () => {
          try {
            // Check if stream still exists (TTL-based cleanup)
            const streamMeta = await streamHelpers.getStreamMeta(streamId);
            if (!streamMeta) {
              console.log(`Stream ${streamId} expired, stopping...`);
              clearInterval(interval);
              activeStreams.delete(streamId);
              return;
            }

            const randomText = generateRandomText();
            chunkCount++;

            // Add chunk as individual event (NO reading/parsing existing data!)
            const result = await streamHelpers.addChunk(streamId, randomText);
            
            if (!result) {
              // Stream expired
              clearInterval(interval);
              activeStreams.delete(streamId);
              return;
            }

            console.log(`Added chunk ${chunkCount} to stream ${streamId}: "${randomText.trim()}"`);

            // Auto-stop after 100 chunks
            if (chunkCount >= 5000) {
              clearInterval(interval);
              activeStreams.delete(streamId);

              await streamHelpers.completeStream(streamId, {
                totalChunks: chunkCount,
                reason: "auto-completed"
              });
            }
          } catch (error) {
            console.error("Stream error:", error);
            clearInterval(interval);
            activeStreams.delete(streamId);
          }
        }, intervalMs);

        activeStreams.set(streamId, interval);

        return { success: true, message: "Stream started", streamId };

      } else if (action === "stop") {
        console.log(`Stopping stream ${streamId}`);
        const interval = activeStreams.get(streamId);
        if (!interval) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Stream not found or already stopped",
          });
        }
        console.log(`Clearing interval for stream ${streamId}`);

        clearInterval(interval);
        activeStreams.delete(streamId);

        console.log(`Completing stream ${streamId}`);
        await streamHelpers.completeStream(streamId, {
          reason: "manual-stop"
        });

        console.log(`Stream ${streamId} stopped`);

        return { success: true, message: "Stream stopped", streamId };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid action" });
    }),

  // Listen to a stream (event sourcing approach)
  listenToStream: withOwnerProcedure
    .input(z.object({ 
      streamId: z.string(),
      fromEventId: z.string().optional() // For resuming from specific point
    }))
    .mutation(async function* ({ input }) {
      const { streamId, fromEventId } = input;
      
      // Use the clean utility function that handles all the complexity
      const streamListener = createStreamListener({
        streamId,
        fromEventId,
        timeoutMs: 30000
      });

      // Simply yield all events from the utility
      for await (const event of streamListener) {
        yield event as StreamChunk;
      }
    }),

  // Get stream content built from events
  getStreamContent: withOwnerProcedure
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { streamId } = input;
      
      const [events, meta] = await Promise.all([
        streamHelpers.getStreamEvents(streamId),
        streamHelpers.getStreamMeta(streamId)
      ]);

      if (!meta) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stream not found or expired"
        });
      }

      const { content, chunks, eventCount } = streamHelpers.buildContentFromEvents(events);

      return {
        streamId,
        content,
        chunks,
        eventCount,
        meta,
        events: events.map(e => ({
          id: e.id,
          type: e.type,
          timestamp: e.timestamp,
          content: e.content || null
        }))
      };
    }),

  // Simple stats
  getActiveStreams: withOwnerProcedure
    .query(async () => {
      return {
        inMemoryCount: activeStreams.size,
        note: "Using Redis Streams event sourcing - no state accumulation!"
      };
    }),

  // Generate stream ID
  generateStreamId: withOwnerProcedure
    .query(() => {
      const streamId = `stream-${randomBytes(8).toString("hex")}-${Date.now()}`;
      return { streamId };
    }),

  // Get TTL info for debugging unified expiration
  getStreamTTL: withOwnerProcedure
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { streamId } = input;
      return await streamHelpers.getTTLInfo(streamId);
    }),
}); 