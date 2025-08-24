/**
 * Message Streaming Operations
 *
 * Main business logic for message chunk streaming and subscription
 */

import { MessageStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import superjson from "superjson";
import { redisReader, redisUtil } from "./clients";
import { createStreamQueue } from "./stream-queue";
import type {
  MessageChunkStreamData,
  MessageType,
  StreamMessage,
} from "./types";
import { generateContent, splitIntoChunks } from "./utils/content-generation";

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;

/**
 * Start a new message chunk stream using chatId as streamId
 */
export async function startMessageChunkStream(
  data: MessageChunkStreamData
): Promise<string> {
  const { chatId, userContent, type, intervalMs, maxChunks = 20 } = data;

  // Kick off producer asynchronously (fire-and-forget)
  (async () => {
    // Create Redis stream queue with abstraction
    const streamQueue = createStreamQueue(chatId, {
      batchTimeMs: 1000,
      maxBatchSize: 100,
      expireAfterSeconds: 3600,
    });

    const { enqueue, cleanup } = streamQueue;

    // Combined message with user content (agent content will be filled during streaming)
    const combinedMessage: MessageType = {
      id: `msg_${randomBytes(8).toString("hex")}`,
      createdAt: new Date(),
      chatId,
      userContent: userContent,
      agentContent: null,
      status: MessageStatus.STARTED,
      finishedAt: null,
    };
    await enqueue({ type: "messageStart", message: combinedMessage, chatId });

    const fullContent = generateContent(type, userContent);
    const chunks = splitIntoChunks(fullContent, maxChunks);

    const stopKey = `stop-stream:${chatId}`;
    let accumulated = "";

    for (let i = 0; i < chunks.length; i++) {
      // Check stop flag before producing next chunk
      if (await redisUtil.exists(stopKey)) {
        console.log(
          `🛑 Stop requested for chat ${chatId}. Halting stream at chunk ${i}.`
        );
        break;
      }

      const chunk = chunks[i];
      accumulated += chunk;
      console.log(`🎬 Streamed chunk ${i + 1} for chat ${chatId}`);
      await enqueue({
        type: "agentChunk",
        messageId: combinedMessage.id,
        chunk,
        chunkId: `chunk-${i + 1}`,
        chatId,
      });

      // Small delay between chunks if configured
      console.log(`🎬 Waiting for ${intervalMs}ms before next chunk`);
      if (intervalMs > 0)
        await new Promise((res) => setTimeout(res, intervalMs));
    }

    // Always signal completion so subscribers can finish cleanly
    const completedMessage: MessageType = {
      ...combinedMessage,
      agentContent: accumulated,
      status: MessageStatus.COMPLETED,
      finishedAt: new Date(),
    };
    await enqueue({
      type: "messageComplete",
      message: completedMessage,
      chatId,
    });

    // Clean up the queue
    cleanup();

    // Clean up stop flag if it was set
    await redisUtil.del(stopKey);

    console.log(`🎬 Streaming completed for chat ${chatId}`);
  })();

  // immediately return chatId so caller isn't blocked
  return chatId;
}

/**
 * Subscribe to message chunk stream events using pure Redis Streams
 */
export async function* subscribeToMessageChunkStream(
  chatId: string,
  options?: { fromTimestamp?: string }
): AsyncGenerator<StreamMessage, void, unknown> {
  console.log(`🎧 Subscribing to Redis Streams for chat: ${chatId}`);

  const streamKey = `${getStreamName(chatId)}:stream`;

  // Convert fromTimestamp to Redis stream ID if provided
  let lastSeenId = "0"; // Default: start from beginning
  if (options?.fromTimestamp) {
    try {
      const timestamp = new Date(options.fromTimestamp).getTime();
      lastSeenId = `${timestamp}-0`; // Convert to Redis stream ID format
      console.log(
        `🕐 Starting from timestamp: ${options.fromTimestamp} (Redis ID: ${lastSeenId})`
      );
    } catch (error) {
      console.warn(
        `⚠️ Invalid fromTimestamp provided: ${options.fromTimestamp}, falling back to start from beginning`
      );
      lastSeenId = "0";
    }
  }

  let streamCompleted = false;

  try {
    // Phase 1: Read all historical messages from the beginning
    console.log(
      `📚 Reading historical messages for chat ${chatId} from ID: ${lastSeenId}`
    );

    // Phase 2: Real-time consumption using XREAD BLOCK
    console.log(`🔴 Switching to real-time mode for chat ${chatId}`);

    while (!streamCompleted) {
      const messages = (await redisReader.xread(
        "COUNT",
        "500", // read 500 messages at a time to prevent memory bloat
        "BLOCK",
        "30000", // drop the connection if no messages are available for 30 seconds
        "STREAMS",
        streamKey,
        lastSeenId
      )) as Array<[string, Array<[string, string[]]>]> | null;

      if (!messages || messages.length === 0) {
        continue;
      }

      const streamData = messages[0];
      if (streamData) {
        const [, entries] = streamData;

        for (const [messageId, fields] of entries) {
          const eventData = fields[1]; // 'event' field value
          if (eventData) {
            const event = superjson.parse(eventData) as StreamMessage;
            console.log(`📨 Real-time event for ${chatId}: ${event.type}`);

            yield event as unknown as StreamMessage;
            console.log("event ", event);

            lastSeenId = messageId; // Update last seen ID

            if (event.type === "messageComplete") {
              console.log(`🏁 Real-time stream completed for ${chatId}`);
              streamCompleted = true;
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error in stream subscription for ${chatId}:`, error);
  } finally {
    console.log(`📡 Redis Streams subscription closed for chat ${chatId}`);
  }
}
