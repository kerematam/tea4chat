import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { cacheHelpers, redisPubSub } from "../lib/redis";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

// Types for stream data
export type StreamChunk = {
  type: "start" | "chunk" | "complete" | "error";
  streamId: string;
  content?: string; // Delta content for chunks
  fullContent?: string; // Full content only on start/resume and completion
  timestamp: string;
  error?: string;
};

// Store for active streams (in production, this should be in Redis)
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

export const streamRouter = router({
  // Create or stop a stream
  manageStream: withOwnerProcedure
    .input(
      z.object({
        streamId: z.string(),
        action: z.enum(["start", "stop"]),
        intervalMs: z.number().min(100).max(5000).default(1000), // Stream interval between 100ms-5s
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { streamId, action, intervalMs } = input;
      const channel = `demo:stream:${streamId}`;

      if (action === "start") {
        // Check if stream already exists
        if (activeStreams.has(streamId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Stream already active",
          });
        }

        // Initialize stream data in Redis
        await cacheHelpers.streaming.startStream(streamId, "demo-message", {
          type: "demo",
          intervalMs,
          channel,
        });

        // Publish start event
        await redisPubSub.publish(channel, JSON.stringify({
          type: "start",
          streamId,
          timestamp: new Date().toISOString(),
        } as StreamChunk));

        let chunkCount = 0;
        let fullContent = "";

        // Start streaming random text
        const interval = setInterval(async () => {
          try {
            const randomText = generateRandomText();
            fullContent += randomText;
            chunkCount++;

            // Publish chunk (only send delta content, not full content)
            await redisPubSub.publish(channel, JSON.stringify({
              type: "chunk",
              streamId,
              content: randomText, // Only the new chunk
              timestamp: new Date().toISOString(),
            } as StreamChunk));

            // Update stream data in Redis
            await cacheHelpers.streaming.appendToStream(streamId, randomText);

            // Auto-stop after 50 chunks for demo purposes
            if (chunkCount >= 50) {
              clearInterval(interval);
              activeStreams.delete(streamId);

              // Publish completion (send final full content)
              await redisPubSub.publish(channel, JSON.stringify({
                type: "complete",
                streamId,
                fullContent, // Send full content on completion
                timestamp: new Date().toISOString(),
              } as StreamChunk));

              await cacheHelpers.streaming.endStream(streamId);
            }
          } catch (error) {
            console.error("Stream error:", error);
            clearInterval(interval);
            activeStreams.delete(streamId);
            
            // Publish error
            await redisPubSub.publish(channel, JSON.stringify({
              type: "error",
              streamId,
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: new Date().toISOString(),
            } as StreamChunk));
          }
        }, intervalMs);

        // Store interval reference
        activeStreams.set(streamId, interval);

        return {
          success: true,
          message: "Stream started",
          streamId,
          channel,
        };

      } else if (action === "stop") {
        // Stop existing stream
        const interval = activeStreams.get(streamId);
        if (!interval) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Stream not found or already stopped",
          });
        }

        clearInterval(interval);
        activeStreams.delete(streamId);

        // Get current stream data
        const streamData = await cacheHelpers.streaming.getActiveStream(streamId);
        
        // Publish completion event (send final full content)
        await redisPubSub.publish(channel, JSON.stringify({
          type: "complete",
          streamId,
          fullContent: streamData?.content || "", // Send full content on completion
          timestamp: new Date().toISOString(),
        } as StreamChunk));

        // End stream in Redis
        await cacheHelpers.streaming.endStream(streamId);

        return {
          success: true,
          message: "Stream stopped",
          streamId,
          finalContent: streamData?.content || "",
        };
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid action",
      });
    }),

  // Listen to a stream (streaming mutation like sendWithStream)
  listenToStream: withOwnerProcedure
    .input(
      z.object({
        streamId: z.string(),
      })
    )
    .mutation(async function* ({ input }) {
      const { streamId } = input;
      const channel = `demo:stream:${streamId}`;

      // Create a new Redis client for this streaming connection
      const subscriber = new (await import("ioredis")).default({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      try {
        // Subscribe to the stream channel
        await subscriber.subscribe(channel);

        // Check if stream is already active and get current state
        const currentStream = await cacheHelpers.streaming.getActiveStream(streamId);
        if (currentStream) {
          // Emit current state first with full content (for resume functionality)
          yield {
            type: "start",
            streamId,
            fullContent: currentStream.content || "", // Send full content on resume
            timestamp: currentStream.updatedAt || currentStream.startedAt,
          } as StreamChunk;
        }

        // Use a queue to handle async messages
        const messageQueue: StreamChunk[] = [];
        let waitingForMessage = false;
        let messageResolver: ((value: StreamChunk | null) => void) | null = null;

        // Listen for new messages
        const messageHandler = (receivedChannel: string, message: string) => {
          if (receivedChannel !== channel) return;
          
          try {
            const data = JSON.parse(message) as StreamChunk;
            if (data.streamId === streamId) {
              if (waitingForMessage && messageResolver) {
                // Resolve immediately if we're waiting
                messageResolver(data);
                messageResolver = null;
                waitingForMessage = false;
              } else {
                // Queue the message
                messageQueue.push(data);
              }
            }
          } catch (error) {
            console.error("Error parsing stream message:", error);
          }
        };

        subscriber.on('message', messageHandler);

        // Helper function to get next message
        const getNextMessage = (): Promise<StreamChunk | null> => {
          if (messageQueue.length > 0) {
            return Promise.resolve(messageQueue.shift()!);
          }

          return new Promise((resolve) => {
            waitingForMessage = true;
            messageResolver = resolve;
            
            // Set timeout
            setTimeout(() => {
              if (waitingForMessage && messageResolver === resolve) {
                waitingForMessage = false;
                messageResolver = null;
                resolve(null); // Timeout
              }
            }, 30000); // 30s timeout
          });
        };

        // Stream messages until completion or error
        let streaming = true;
        while (streaming) {
          try {
            const data = await getNextMessage();
            
            if (data === null) {
              // Timeout - check if stream is still active
              const streamData = await cacheHelpers.streaming.getActiveStream(streamId);
              if (!streamData) {
                streaming = false;
              }
              continue;
            }

            yield data;

            // Check if stream is complete
            if (data.type === "complete" || data.type === "error") {
              streaming = false;
            }
          } catch (error) {
            console.error("Stream listening error:", error);
            streaming = false;
          }
        }
      } finally {
        // Cleanup
        try {
          await subscriber.unsubscribe(channel);
          subscriber.disconnect();
        } catch (error) {
          console.error("Error cleaning up subscriber:", error);
        }
      }
    }),

  // Get active streams (utility endpoint)
  getActiveStreams: withOwnerProcedure
    .query(async () => {
      const streamIds = Array.from(activeStreams.keys());
      const streamData = await Promise.all(
        streamIds.map(async (streamId) => {
          const data = await cacheHelpers.streaming.getActiveStream(streamId);
          return {
            streamId,
            ...data,
          };
        })
      );

      return {
        activeStreams: streamData.filter(Boolean),
        count: streamIds.length,
      };
    }),

  // Generate a random stream ID (utility)
  generateStreamId: withOwnerProcedure
    .query(() => {
      const streamId = `stream-${randomBytes(8).toString("hex")}-${Date.now()}`;
      return { streamId };
    }),
}); 