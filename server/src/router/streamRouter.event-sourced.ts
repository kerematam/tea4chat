import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { streamHelpers, redisPubSub } from "../lib/redis.event-sourcing";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { createStreamListener } from "../lib/stream-listener.js";
import { initializeStream } from "../lib/stream-initializer.js";

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

// Type for our demo stream data
export interface DemoStreamData {
  content: string;
  chunkNumber?: number;
  metadata?: object;
}

// Simple in-memory store for active intervals and controllers
const activeStreams = new Map<string, NodeJS.Timeout>();
const activeControllers = new Map<string, any>(); // Store controllers for stop functionality

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
  activeControllers.clear();
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

        // Initialize stream with smart recreation logic
        const streamController = await initializeStream<DemoStreamData>({
          streamId,
          streamConfig: {
            type: "demo",
            intervalMs,
            ownerId: ctx.owner?.id,
          },
          staleTimeoutSeconds: STALE_STREAM_TIMEOUT,
          activeStreamsMap: activeStreams,
          activeControllersMap: activeControllers
        });

        console.log(`Stream ${streamId} initialized:`, {
          wasRecreated: streamController.initializationResult.wasRecreated,
          cleanupPerformed: streamController.initializationResult.cleanupPerformed,
          reason: streamController.initializationResult.reason
        });

        // No callbacks needed - controller handles everything internally

        let chunkCount = 0;

        // Start streaming - each chunk is a separate event
        const interval = setInterval(async () => {
          try {
            // Check if stream still exists (TTL-based cleanup handled by controller)
            const streamMeta = await streamController.getMeta();
            if (!streamMeta) {
              // Stream expired - cleanup handled automatically by getMeta()
              return;
            }

            const randomText = generateRandomText();
            chunkCount++;

            // Add chunk as individual event (NO reading/parsing existing data!)
            const result = await streamController.push({ 
              content: randomText,
              chunkNumber: chunkCount,
              metadata: { generatedAt: new Date().toISOString() }
            });
            
            if (!result) {
              // Stream expired - cleanup handled automatically
              return;
            }

            console.log(`Added chunk ${chunkCount} to stream ${streamId}: "${randomText.trim()}"`);

            // Auto-stop after 5000 chunks
            if (chunkCount >= 5000) {
              await streamController.complete({
                totalChunks: chunkCount,
                reason: "auto-completed"
              });
            }
          } catch (error) {
            console.error("Stream error:", error);
            // Use proper terminate method for automatic cleanup
            await streamController.terminate("error");
          }
        }, intervalMs);

        activeStreams.set(streamId, interval);
        activeControllers.set(streamId, streamController);

        return { success: true, message: "Stream started", streamId };

      } else if (action === "stop") {
        console.log(`Stopping stream ${streamId} via controller`);
        const controller = activeControllers.get(streamId);
        if (!controller) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Stream not found or already stopped",
          });
        }

        // Use the controller's terminate method - this will handle cleanup automatically
        await controller.terminate("manual-stop");

        console.log(`Stream ${streamId} stopped via controller`);

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