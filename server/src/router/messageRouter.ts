import { MessageStatus, PrismaClient, type Message, type ModelCatalog } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FALLBACK_MODEL } from "../constants/defaultOwnerSettings";
import { createAIProviderFromModel, type AIMessage, type AIProvider } from "../lib/ai-providers";
import { ErrorCode, STREAM_ERROR_MESSAGES } from "../lib/errors";
import { createIsolatedStream, type IsolatedStreamCallbacks } from "../lib/isolated-stream";
import { cacheHelpers } from "../lib/redis";
import { createStreamQueue, subscribeToMessageChunkStream } from "../lib/redis-message";
import { createStreamId, streamAbortRegistry } from "../lib/stream-abort-registry";
import { withOwnerProcedure } from "../procedures";
import { router } from "../trpc";

export type StreamMessage = {
  type: "userMessage" | "aiMessageStart" | "aiMessageChunk" | "aiMessageComplete";
  message?: any;
  messageId?: string;
  chunk?: string;
  chatId: string;
};

// TODO: type inference from prisma is not working, so we need to manually type
// the message type for tRPC infinite query compatibility
export type MessageType = {
  id: string;
  createdAt: Date;
  chatId: string;
  content: string;
  from: string;
  text: string;
};


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
const fetchOlderMessages = async (chatId: string, cursorDate: Date, limit: number): Promise<Message[]> => {
  const messages = await prisma.message.findMany({
    where: {
      chatId,
      createdAt: { lt: cursorDate },
      status: MessageStatus.COMPLETED,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse();
};

const fetchNewerMessages = async (chatId: string, cursorDate: Date, limit: number): Promise<Message[]> => {
  return await prisma.message.findMany({
    where: {
      chatId,
      createdAt: { gt: cursorDate },
      status: MessageStatus.COMPLETED,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
};

/** check latest message status from given date */
const fetchStreamingMessage = async (chatId: string, cursorDate: Date): Promise<Message | null> => {
  return await prisma.message.findFirst({
    where: {
      chatId,
      createdAt: { gt: cursorDate },
      status: { in: [MessageStatus.STARTED, MessageStatus.STREAMING] },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
};

// Calculate sync date for React Query optimization
// This prevents stale cache hits and enables efficient incremental loading
const calculateSyncDate = (direction: "backward" | "forward", messages: Message[], cursorDate: string): string => {
  // For backward direction (fetching newer messages), use the newest message timestamp
  // This establishes the sync point for future fetches
  if (direction === "backward" && messages.length > 0) {
    const lastMessage = messages.at(-1);
    if (lastMessage) {
      return lastMessage.createdAt.toISOString();
    }
  }

  // For forward direction or no messages, use the cursor date
  return cursorDate;
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
  sendWithStream: withOwnerProcedure
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

      try {
        // Save user message to database
        const userMessage = await prisma.message.create({
          data: {
            content: input.content,
            from: "user",
            text: input.content,
            chatId: chatId,
          },
        });

        const modelToUse = await determineModelToUse({
          modelId: input.modelId,
          chatModel: chat.model,
        });

        console.log("modelToUse", modelToUse);

        // yield the user message first, before database updates so that the
        // client can see it immediately
        yield {
          type: "userMessage" as const,
          message: userMessage as MessageType,
          chatId: chatId,
        };

        // Prepare conversation history
        const conversationHistory = chat.messages.map((msg) => ({
          role: msg.from as "user" | "assistant",
          content: msg.content,
        }));

        // Add the new user message to conversation history
        conversationHistory.push({
          role: "user",
          content: userMessage.content,
        });

        // Create a placeholder AI message in the database
        const aiMessage = await prisma.message.create({
          data: {
            status: MessageStatus.STARTED,
            content: "",
            from: "assistant",
            text: "",
            chatId: chatId,
          },
        });

        // Register this stream for potential abortion
        const streamId = createStreamId(chatId, ctx.owner.id);
        const abortController = streamAbortRegistry.register(streamId);

        // Create streaming process function
        const streamAIResponse = async ({ enqueue, close, error }: IsolatedStreamCallbacks<StreamMessage>) => {
          let aiProvider: undefined | AIProvider;
          let redisStreamQueue: ReturnType<typeof createStreamQueue> | null = null;

          try {
            // Create Redis stream queue for persistent streaming (allows other clients to join)
            redisStreamQueue = createStreamQueue(chatId, {
              batchTimeMs: 1000,
              maxBatchSize: 100,
              expireAfterSeconds: 3600 // 1 hour
            });

            // Helper function to enqueue to both current stream and Redis stream
            const dualEnqueue = async (message: StreamMessage) => {
              // Enqueue to current client stream (real-time for initiating client)
              enqueue(message);

              // Enqueue to Redis stream (persistent for other clients/page refreshes)
              await redisStreamQueue!.enqueue(message);
            };

            // First, enqueue the user message to Redis stream
            await redisStreamQueue.enqueue({
              type: "userMessage",
              message: userMessage as MessageType,
              chatId: chatId,
            });

            // Check if already aborted before starting
            if (abortController.signal.aborted) {
              error(new TRPCError({
                code: 'CLIENT_CLOSED_REQUEST',
                message: STREAM_ERROR_MESSAGES.ABORTED_BEFORE_START
              }));
              return;
            }

            // Emit the initial AI message to both streams
            await dualEnqueue({
              type: "aiMessageStart",
              message: aiMessage as MessageType,
              chatId: chatId,
            });

            let fullContent = "";

            // Get user's API keys from settings
            const ownerSettings = await prisma.ownerSettings.findUnique({
              where: { ownerId: ctx.owner.id },
              select: { openaiApiKey: true, anthropicApiKey: true },
            });

            // Check abort signal after async operation
            if (abortController.signal.aborted) {
              error(new TRPCError({
                code: 'CLIENT_CLOSED_REQUEST',
                message: STREAM_ERROR_MESSAGES.ABORTED_DURING_PROCESSING
              }));
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

            console.log("aiProvider created");

            // Convert conversation history to AI provider format
            const aiMessages: AIMessage[] = conversationHistory
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .map(msg => ({
                role: msg.role as "user" | "assistant",
                content: msg.content.trim(),
              }));

            console.log(`Streaming with ${aiProvider.name} provider using model ${aiProvider.model}`);

            // Stream the response using the AI provider abstraction
            for await (const chunk of aiProvider.streamResponse(aiMessages)) {
              // Check for abort signal during streaming
              if (abortController.signal.aborted) {
                console.log(`${aiProvider.name} stream aborted`);
                error(new TRPCError({
                  code: 'CLIENT_CLOSED_REQUEST',
                  message: STREAM_ERROR_MESSAGES.ABORTED_DURING_PROCESSING
                }));
                return;
              }

              if (chunk.content && !chunk.isComplete) {
                fullContent += chunk.content;
                await dualEnqueue({
                  type: "aiMessageChunk",
                  messageId: aiMessage.id,
                  chunk: chunk.content,
                  chatId: chatId,
                });
              }

              if (chunk.isComplete) {
                break;
              }
            }

            // Update the AI message in the database with the complete content
            const updatedAiMessage = await prisma.message.update({
              where: { id: aiMessage.id },
              data: {
                content: fullContent,
                text: fullContent,
                status: MessageStatus.COMPLETED,
              },
            });

            // Emit the final complete message to both streams
            await dualEnqueue({
              type: "aiMessageComplete",
              message: updatedAiMessage as MessageType,
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
              const errorMessage = (err as any)?.message || 'Streaming error';
              const providerName = aiProvider?.name || 'unknown';

              // Check for specific error patterns from AI providers
              if (errorMessage.includes('API key') || errorMessage.includes('unauthorized') || errorMessage.includes('Invalid API key')) {
                error(new TRPCError({
                  code: 'UNAUTHORIZED',
                  message: `${providerName} API key not configured or invalid. Please check your API key in settings.`,
                  cause: { errorCode: ErrorCode.API_KEY_INVALID, provider: providerName }
                }));
              } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
                error(new TRPCError({
                  code: 'TOO_MANY_REQUESTS',
                  message: 'Rate limit exceeded. Please try again later.',
                  cause: { errorCode: ErrorCode.RATE_LIMIT_EXCEEDED, provider: providerName }
                }));
              } else if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
                error(new TRPCError({
                  code: 'FORBIDDEN',
                  message: 'Quota exceeded. Please check your billing.',
                  cause: { errorCode: ErrorCode.QUOTA_EXCEEDED, provider: providerName }
                }));
              } else {
                error(new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: errorMessage,
                  cause: { errorCode: ErrorCode.PROVIDER_UNAVAILABLE, provider: providerName }
                }));
              }
            }
          } finally {
            // Always cleanup both streams when done
            streamAbortRegistry.cleanup(streamId);

            // Cleanup Redis stream queue
            if (redisStreamQueue) {
              redisStreamQueue.cleanup();
            }
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
        cursor: z.string(),
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

      let messages: Message[] = [];

      if (direction === "forward") {
        // Fetch older messages (going back in time)
        messages = await fetchOlderMessages(chatId, cursorDateTime, limit);
      } else {
        // Fetch newer messages (going forward in time)
        messages = await fetchNewerMessages(chatId, cursorDateTime, limit);
      }

      // Calculate sync date for React Query optimization
      // if last page

      const syncDate = calculateSyncDate(direction, messages, cursor);
      const streamingMessage = await fetchStreamingMessage(chatId, cursorDateTime);

      return {
        messages: messages as MessageType[],
        direction,
        syncDate,
        streamingMessage,
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

      const streamId = createStreamId(input.chatId, ctx.owner.id);
      const wasAborted = streamAbortRegistry.abort(streamId);

      return {
        success: wasAborted,
        message: wasAborted
          ? "Stream aborted successfully"
          : "No active stream found for this chat"
      };
    }),

  // Get active streams for debugging/monitoring
  getActiveStreams: withOwnerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      const allActiveStreams = streamAbortRegistry.getActiveStreamIds();
      // Filter streams that belong to this owner
      const ownerStreams = allActiveStreams.filter(streamId =>
        streamId.endsWith(`:${ctx.owner.id}`)
      );

      return {
        activeStreams: ownerStreams.map(streamId => ({
          streamId,
          chatId: streamId.split(':')[0]
        }))
      };
    }),

  // Listen to Redis message chunk stream for reconnection/page refresh scenarios
  listenToMessageChunkStream: withOwnerProcedure
    .input(z.object({
      chatId: z.string(),
      fromTimestamp: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`🎧 User ${ctx.owner?.id} listening to message chunk stream for chat: ${input.chatId}${input.fromTimestamp ? ` from timestamp: ${input.fromTimestamp}` : ''}`);


      // Return the async generator from subscribeToMessageChunkStream with optional timestamp
      return subscribeToMessageChunkStream(input.chatId, {
        // fromTimestamp: input.fromTimestamp 
      });
    }),

}); 