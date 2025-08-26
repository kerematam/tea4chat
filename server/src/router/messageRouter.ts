import {
  MessageStatus,
  PrismaClient,
  type ModelCatalog,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FALLBACK_MODEL } from "../constants/defaultOwnerSettings";
import {
  createAIProviderFromModel,
  type AIMessage,
  type AIProvider,
} from "../lib/ai-providers";
import { ErrorCode, STREAM_ERROR_MESSAGES } from "../lib/errors";
import {
  createIsolatedStream,
  type IsolatedStreamCallbacks,
} from "../lib/isolated-stream";
import { checkFreeTierRateLimit } from "../lib/rate-limit";
import { cacheHelpers } from "../lib/redis";
import {
  createStreamQueue,
  stopMessageChunkStream,
  subscribeToMessageChunkStream,
} from "../lib/redis-message";
import { redisUtil } from "../lib/redis-message/clients";
import {
  createStreamId,
  streamAbortRegistry,
} from "../lib/stream-abort-registry";
import { streamingProcedure, withOwnerProcedure } from "../procedures/base";
import { router } from "../trpc";
import { publicMessageSelect, type PublicMessage } from "./message.public";

export type StreamMessage = {
  type: "messageStart" | "agentChunk" | "messageComplete";
  message?: MessageType;
  messageId?: string;
  chunk?: string;
  chatId: string;
};

// TODO: use this instead of MessageType
// import type { Message as MessageType } from "@prisma/client";
export type MessageType = PublicMessage;

const prisma = new PrismaClient();

// Initialize OpenAI client
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// // Initialize Anthropic client
// const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY,
// });

/**
 * React Query optimization - using date-based cursor instead of invalidation
 *
 * We avoid using query invalidation for chat messages because:
 * 1. Chat history is immutable (messages never change once created)
 * 2. Invalidation would be overkill and cause unnecessary re-fetches for all cached history
 * 3. We only need to fetch NEW messages, not re-fetch existing ones
 *
 * Instead, we use a date-based cursor mechanism that "hacks" React Query's caching
 * by always providing a fresh cursor, preventing stale cache hits while allowing
 * efficient incremental loading.
 */

// Helper functions for message fetching
const fetchOlderMessages = async (
  chatId: string,
  cursorDate: Date,
  limit: number
): Promise<PublicMessage[]> => {
  const messages = await prisma.message.findMany({
    where: {
      chatId,
      finishedAt: { lt: cursorDate },
      status: {
        in: [
          MessageStatus.COMPLETED,
          MessageStatus.ABORTED,
          MessageStatus.FAILED,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: publicMessageSelect,
  });

  return messages.reverse();
};

const fetchNewerMessages = async (
  chatId: string,
  cursorDate: Date,
  limit: number
): Promise<PublicMessage[]> => {
  return await prisma.message.findMany({
    where: {
      chatId,
      finishedAt: { gt: cursorDate },
      // completed, aborted, failed
      status: {
        in: [
          MessageStatus.COMPLETED,
          MessageStatus.ABORTED,
          MessageStatus.FAILED,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: publicMessageSelect,
  });
};

/** check latest message status from given date */
const fetchStreamingMessage = async (
  chatId: string
  // cursorDate: Date //TODO: support this
): Promise<PublicMessage | null> => {
  const latestMessage = await prisma.message.findFirst({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: publicMessageSelect,
  });

  if (
    latestMessage?.status === MessageStatus.STARTED ||
    latestMessage?.status === MessageStatus.STREAMING
  ) {
    return latestMessage;
  }

  return null;
};

// Helper function to determine which model to use
const determineModelToUse = async ({
  modelId,
  chatModel,
}: {
  modelId?: string;
  chatModel?: Pick<ModelCatalog, "provider" | "name"> | null;
}): Promise<Pick<ModelCatalog, "provider" | "name">> => {
  if (modelId) {
    const model = await prisma.modelCatalog.findUnique({
      where: { id: modelId },
      select: { provider: true, name: true },
    });

    if (!model) throw new Error("Model not found");

    return { provider: model.provider, name: model.name };
  } else if (chatModel) {
    return {
      provider: chatModel.provider,
      name: chatModel.name,
    };
  } else {
    return FALLBACK_MODEL;
  }
};

export const messageRouter = router({
  // Send a message and stream AI response in one mutation
  sendWithStream: streamingProcedure
    .input(
      z.object({
        chatId: z.string().optional(),
        content: z.string().min(1, "Message content is required"),
        modelId: z.string().optional(),
      })
    )
    .mutation(async function* ({ input, ctx }) {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      let chat;
      let chatId = input.chatId;

      if (!chatId) {
        // Create a new chat if no chatId provided
        chat = await prisma.chat.create({
          data: {
            title: input.content,
            description: "",
            ownerId: ctx.owner.id,
            ...(input.modelId ? { modelId: input.modelId } : {}),
          },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20,
            },
            model: true,
          },
        });
        chatId = chat.id;
      } else {
        // Verify existing chat belongs to the owner
        chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            ownerId: ctx.owner.id,
            isDeleted: false,
          },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20, // Get last 20 messages for context
            },
            model: true,
          },
        });

        if (!chat) {
          throw new Error("Chat not found");
        }
      }

      // If a modelId is provided, persist it as the chat's local model selection
      if (input.modelId && chatId) {
        await prisma.chat.update({
          where: { id: chatId },
          data: { modelId: input.modelId },
        });
      }

      const modelToUse = await determineModelToUse({
        modelId: input.modelId,
        chatModel: chat.model,
      });

      // Get user's API keys from settings
      const ownerSettings = await prisma.ownerSettings.findUnique({
        where: { ownerId: ctx.owner.id },
        select: { openaiApiKey: true, anthropicApiKey: true },
      });

      const shouldCheckRateLimit =
        (modelToUse.provider === "openai" && !ownerSettings?.openaiApiKey) ||
        (modelToUse.provider === "anthropic" &&
          !ownerSettings?.anthropicApiKey);

      // rate limti check if no api key is provided for openAi model or anthropic model
      if (shouldCheckRateLimit) {
        const rateLimitResult = await checkFreeTierRateLimit(
          ctx.owner.id,
          modelToUse.provider
        );

        if (rateLimitResult.isRateLimited) {
          const timeLeftMinutes = rateLimitResult.timeLeftSeconds
            ? Math.ceil(rateLimitResult.timeLeftSeconds / 60)
            : null;

          const message = timeLeftMinutes
            ? `Rate limit exceeded. Please try again in ${timeLeftMinutes} minutes or setup API key in settings.`
            : "Rate limit exceeded. Please try again later or setup API key in settings.";

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message,
          });
        }
      }

      try {
        // Create combined message with user content (agent content will be filled during streaming)
        const combinedMessage = await prisma.message.create({
          data: {
            userContent: input.content,
            agentContent: null, // Will be filled during streaming
            chatId: chatId,
            status: MessageStatus.STARTED,
            ...(input.modelId ? { modelId: input.modelId } : {}),
          },
          select: publicMessageSelect,
        });

        // yield the message start event with user content
        yield {
          type: "messageStart" as const,
          message: combinedMessage as MessageType,
          chatId: chatId,
        };

        // Prepare conversation history from combined messages
        const conversationHistory: Array<{
          role: "user" | "assistant";
          content: string;
        }> = [];

        for (const msg of chat.messages) {
          // Add user message
          conversationHistory.push({
            role: "user",
            content: msg.userContent,
          });

          // Add agent response if it exists
          if (msg.agentContent) {
            conversationHistory.push({
              role: "assistant",
              content: msg.agentContent,
            });
          }
        }

        // Add the new user message to conversation history
        conversationHistory.push({
          role: "user",
          content: combinedMessage.userContent,
        });

        // Register this stream for potential abortion
        const streamId = createStreamId(chatId, ctx.owner.id);
        const abortController = streamAbortRegistry.register(streamId);

        // Create streaming process function
        const streamAIResponse = async ({
          enqueue,
          close,
          error,
        }: IsolatedStreamCallbacks<StreamMessage>) => {
          let aiProvider: undefined | AIProvider;
          let redisStreamQueue: ReturnType<typeof createStreamQueue> | null =
            null;

          try {
            // Create Redis stream queue for persistent streaming (allows other clients to join)
            redisStreamQueue = createStreamQueue(chatId, {
              batchTimeMs: 1000,
              maxBatchSize: 100,
              expireAfterSeconds: 3600, // 1 hour
            });

            // Helper function to enqueue to both current stream and Redis stream
            const dualEnqueue = async (message: StreamMessage) => {
              // Enqueue to current client stream (real-time for initiating client)
              enqueue(message);

              // Enqueue to Redis stream (persistent for other clients/page refreshes)
              if (redisStreamQueue) await redisStreamQueue.enqueue(message);
              else console.error("Redis stream queue not created");
            };

            // First, enqueue the message start to Redis stream
            await redisStreamQueue.enqueue({
              type: "messageStart",
              message: combinedMessage as MessageType,
              chatId: chatId,
            });

            // Check if already aborted before starting
            if (abortController.signal.aborted) {
              error(
                new TRPCError({
                  code: "CLIENT_CLOSED_REQUEST",
                  message: STREAM_ERROR_MESSAGES.ABORTED_BEFORE_START,
                })
              );
              return;
            }

            // Update message status to STREAMING
            await prisma.message.update({
              where: { id: combinedMessage.id },
              data: { status: MessageStatus.STREAMING },
            });

            let fullContent = "";

            // Check abort signal after async operation
            if (abortController.signal.aborted) {
              error(
                new TRPCError({
                  code: "CLIENT_CLOSED_REQUEST",
                  message: STREAM_ERROR_MESSAGES.ABORTED_DURING_PROCESSING,
                })
              );
              return;
            }

            // Create AI provider using the abstraction
            aiProvider = createAIProviderFromModel(
              modelToUse,
              ownerSettings || { openaiApiKey: null, anthropicApiKey: null },
              {
                maxTokens: 4096,
                temperature: 0.7,
              }
            );

            // Convert conversation history to AI provider format
            const aiMessages: AIMessage[] = conversationHistory
              .filter((msg) => msg.content && msg.content.trim().length > 0)
              .map((msg) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content.trim(),
              }));

            console.log(
              `Streaming with ${aiProvider.name} provider using model ${aiProvider.model}`
            );

            // Stream the response using the AI provider abstraction
            for await (const chunk of aiProvider.streamResponse(aiMessages)) {
              // Check Redis stop flag for this chat
              const stopKey = `stop-stream:${chatId}`;
              const shouldStop = await redisUtil.exists(stopKey);
              if (shouldStop) {
                console.log(
                  `🛑 Stop requested for chat ${chatId}. Halting AI response stream.`
                );
                break;
              }

              if (chunk.content && !chunk.isComplete) {
                fullContent += chunk.content;
                await dualEnqueue({
                  type: "agentChunk",
                  messageId: combinedMessage.id,
                  chunk: chunk.content,
                  chatId: chatId,
                });
              }

              if (chunk.isComplete) {
                break;
              }
            }

            // Update the combined message with complete agent content
            const updatedMessage = await prisma.message.update({
              where: { id: combinedMessage.id },
              data: {
                agentContent: fullContent,
                status: MessageStatus.COMPLETED,
                finishedAt: new Date(),
              },
              select: publicMessageSelect,
            });
            // console.log("UPDATED AI MESSAGE", updatedAiMessage);

            // Emit the final complete message to both streams
            await dualEnqueue({
              type: "messageComplete",
              message: updatedMessage as MessageType,
              chatId: chatId,
            });

            // Flush any remaining Redis stream events
            await redisStreamQueue.cleanup();

            // Invalidate chat cache - this will always run even if client disconnects
            await Promise.all([
              cacheHelpers.invalidateChat(chatId),
              cacheHelpers.invalidateOwnerCache(ctx.owner.id),
            ]);

            // Mark the stream as complete
            close();
          } catch (err) {
            console.error("Error in AI streaming process:", err);

            // Convert provider-specific errors to TRPCError with custom data
            if (err instanceof TRPCError) {
              error(err);
            } else {
              const errorMessage = (err as any)?.message || "Streaming error";
              const providerName = aiProvider?.name || "unknown";

              // Check for specific error patterns from AI providers
              if (
                errorMessage.includes("API key") ||
                errorMessage.includes("unauthorized") ||
                errorMessage.includes("Invalid API key")
              ) {
                error(
                  new TRPCError({
                    code: "UNAUTHORIZED",
                    message: `${providerName} API key not configured or invalid. Please check your API key in settings.`,
                    cause: {
                      errorCode: ErrorCode.API_KEY_INVALID,
                      provider: providerName,
                    },
                  })
                );
              } else if (
                errorMessage.includes("rate limit") ||
                errorMessage.includes("Rate limit")
              ) {
                error(
                  new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Rate limit exceeded. Please try again later.",
                    cause: {
                      errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
                      provider: providerName,
                    },
                  })
                );
              } else if (
                errorMessage.includes("quota") ||
                errorMessage.includes("billing")
              ) {
                error(
                  new TRPCError({
                    code: "FORBIDDEN",
                    message: "Quota exceeded. Please check your billing.",
                    cause: {
                      errorCode: ErrorCode.QUOTA_EXCEEDED,
                      provider: providerName,
                    },
                  })
                );
              } else {
                error(
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: errorMessage,
                    cause: {
                      errorCode: ErrorCode.PROVIDER_UNAVAILABLE,
                      provider: providerName,
                    },
                  })
                );
              }
            }
          } finally {
            // Always cleanup both streams when done
            streamAbortRegistry.cleanup(streamId);

            // Cleanup Redis stream queue
            if (redisStreamQueue) {
              redisStreamQueue.cleanup();
            }

            // Cleanup stop flag if it was set
            const stopKey = `stop-stream:${chatId}`;
            await redisUtil.del(stopKey);
          }
        };

        // Create isolated iterator with streaming process, so that if request drops; request can still complete
        const stream = createIsolatedStream<StreamMessage>(streamAIResponse);

        // Forward items to the client only while the connection is active
        for await (const item of stream) {
          yield item;
        }
      } catch (error) {
        console.error("Error in message processing:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to process message"
        );
      }
    }),

  // Get messages for a chat with bidirectional infinite scroll
  getMessages: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.date(),
        direction: z.enum(["backward", "forward"]).default("backward"),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Verify chat belongs to the owner
      const chat = await prisma.chat.findFirst({
        where: {
          id: input.chatId,
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      const { limit, cursor, direction, chatId } = input;
      const cursorDateTime = new Date(cursor);

      let messages: PublicMessage[] = [];
      let syncDate: Date | null | undefined = null;
      if (direction === "forward") {
        // Fetch older messages (going back in time)
        messages = await fetchOlderMessages(chatId, cursorDateTime, limit);
        syncDate = messages.at(-1)?.finishedAt;
      } else {
        // Fetch newer messages (going forward in time)
        messages = await fetchNewerMessages(chatId, cursorDateTime, limit);
        syncDate = messages[0]?.finishedAt;
      }
      syncDate ??= cursor;

      const streamingMessage = await fetchStreamingMessage(chatId);

      return {
        messages: messages as MessageType[],
        direction,
        syncDate,
        streamingMessage: streamingMessage as MessageType | null,
      };
    }),

  // Abort an active streaming operation
  abortStream: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      const wasAborted = await stopMessageChunkStream(input.chatId);

      return {
        success: wasAborted,
        message: wasAborted
          ? "Stream aborted successfully"
          : "No active stream found for this chat",
      };
    }),

  // Get active streams for debugging/monitoring

  // Listen to Redis message chunk stream for reconnection/page refresh scenarios
  listenToMessageChunkStream: streamingProcedure
    .input(
      z.object({
        chatId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log(
        `🎧 User ${ctx.owner?.id} listening to message chunk stream for chat: ${input.chatId}`
      );

      return subscribeToMessageChunkStream(input.chatId);
    }),
});
