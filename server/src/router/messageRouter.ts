import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { PrismaClient, type Message } from "@prisma/client";
import { cacheHelpers } from "../lib/redis";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { ErrorCode, STREAM_ERROR_MESSAGES } from "../lib/errors";
import { FALLBACK_MODEL, FALLBACK_MODEL_ID } from "../constants/defaultOwnerSettings";
import { createIsolatedIterator, type StreamMessage, type IsolatedIteratorCallbacks } from "../lib/isolated-iterator";
import { streamAbortRegistry, createStreamId } from "../lib/stream-abort-registry";

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
    },
    orderBy: { createdAt: "asc" },
    take: limit,
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

        // Query the model from the database early in the process
        let modelToUse: { provider: string; name: string } = FALLBACK_MODEL;
        if (input.modelId) {
          const model = await prisma.modelCatalog.findUnique({
            where: { id: input.modelId },
            select: { provider: true, name: true },
          });

          if (model) {
            console.log("Found model:", model);
            if (model.provider === "openai" || model.provider === "anthropic") {
              modelToUse = {
                provider: model.provider,
                name: model.name,
              };
              console.log("Using model:", modelToUse);
            } else {
              console.log("Unsupported provider detected:", model.provider);
              throw new Error(`Provider "${model.provider}" is not currently supported`);
            }
          } else {
            console.log("Model not found, using fallback:", modelToUse);
          }
        }

        // Ensure modelToUse is properly set
        if (!modelToUse || !modelToUse.provider || !modelToUse.name) {
          throw new Error("Invalid model configuration");
        }

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
        const streamAIResponse = async ({ emit, complete, error }: IsolatedIteratorCallbacks<StreamMessage>) => {
          try {
            // Check if already aborted before starting
            if (abortController.signal.aborted) {
              error(new TRPCError({
                code: 'CLIENT_CLOSED_REQUEST',
                message: STREAM_ERROR_MESSAGES.ABORTED_BEFORE_START
              }));
              return;
            }

            // Emit the initial AI message
            emit({
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

            // Determine the provider from the model query result
            const selectedProvider = input.modelId ?
              (await prisma.modelCatalog.findUnique({
                where: { id: input.modelId },
                select: { provider: true },
              }))?.provider || "openai" : "openai";

            if (selectedProvider === "anthropic") {
              console.log("Streaming with Anthropic API");

              // Use user's API key if available, otherwise fall back to environment variable
              const anthropicApiKey = ownerSettings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
              if (!anthropicApiKey) {
                throw new TRPCError({
                  code: 'UNAUTHORIZED',
                  message: 'Anthropic API key not configured. Please add your API key in settings.',
                  cause: { errorCode: ErrorCode.API_KEY_MISSING, provider: 'anthropic' }
                });
              }

              // Create Anthropic client with user's API key
              const userAnthropic = new Anthropic({
                apiKey: anthropicApiKey,
              });

              // Convert and filter conversation history for Anthropic API
              const anthropicMessages = conversationHistory
                .filter(msg => msg.content && msg.content.trim().length > 0) // Filter out empty messages
                .map(msg => ({
                  role: msg.role === "assistant" ? "assistant" as const : "user" as const,
                  content: msg.content.trim()
                }));

              // Get streaming response from Anthropic
              const stream = await userAnthropic.messages.create({
                model: modelToUse.name,
                messages: anthropicMessages,
                max_tokens: 4096,
                stream: true,
              });

              // Stream the response chunks from Anthropic
              for await (const chunk of stream) {
                // Check for abort signal during streaming
                if (abortController.signal.aborted) {
                  console.log("Anthropic stream aborted");
                  error(new TRPCError({
                    code: 'CLIENT_CLOSED_REQUEST',
                    message: STREAM_ERROR_MESSAGES.ABORTED_DURING_PROCESSING
                  }));
                  return;
                }

                if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
                  const delta = chunk.delta.text;
                  fullContent += delta;
                  emit({
                    type: "aiMessageChunk",
                    messageId: aiMessage.id,
                    chunk: delta,
                    chatId: chatId,
                  });
                }
              }
            } else {
              console.log("Streaming with OpenAI API");

              // Use user's API key if available, otherwise fall back to environment variable
              const openaiApiKey = ownerSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
              if (!openaiApiKey) {
                throw new TRPCError({
                  code: 'UNAUTHORIZED',
                  message: 'OpenAI API key not configured. Please add your API key in settings.',
                  cause: { errorCode: ErrorCode.API_KEY_MISSING, provider: 'openai' }
                });
              }

              // Create OpenAI client with user's API key
              const userOpenAI = new OpenAI({
                apiKey: openaiApiKey,
              });

              // Get streaming response from OpenAI
              const completion = await userOpenAI.chat.completions.create({
                model: modelToUse.name,
                messages: conversationHistory,
                max_tokens: 4096,
                temperature: 0.7,
                stream: true,
              });

              // Stream the response chunks from OpenAI
              for await (const chunk of completion) {
                // Check for abort signal during streaming
                if (abortController.signal.aborted) {
                  console.log("OpenAI stream aborted");
                  error(new TRPCError({
                    code: 'CLIENT_CLOSED_REQUEST',
                    message: STREAM_ERROR_MESSAGES.ABORTED_DURING_PROCESSING
                  }));
                  return;
                }

                const delta = chunk.choices[0]?.delta?.content || "";
                if (delta) {
                  fullContent += delta;
                  emit({
                    type: "aiMessageChunk",
                    messageId: aiMessage.id,
                    chunk: delta,
                    chatId: chatId,
                  });
                }
              }
            }

            // Update the AI message in the database with the complete content
            const updatedAiMessage = await prisma.message.update({
              where: { id: aiMessage.id },
              data: {
                content: fullContent,
                text: fullContent,
              },
            });

            // Emit the final complete message
            emit({
              type: "aiMessageComplete",
              message: updatedAiMessage as MessageType,
              chatId: chatId,
            });

            // Invalidate chat cache - this will always run even if client disconnects
            await Promise.all([
              cacheHelpers.invalidateChat(chatId),
              cacheHelpers.invalidateOwnerCache(ctx.owner.id),
            ]);

            // Mark the stream as complete
            complete();

          } catch (err) {
            console.error("Error in AI streaming process:", err);

            // Convert provider-specific errors to TRPCError with custom data
            if (err instanceof TRPCError) {
              error(err);
            } else {
              const errorMessage = (err as any)?.message || 'Streaming error';
              const statusCode = (err as any)?.status || (err as any)?.response?.status;

              if (statusCode === 401) {
                error(new TRPCError({
                  code: 'UNAUTHORIZED',
                  message: 'Invalid API key. Please check your API key in settings.',
                  cause: { errorCode: ErrorCode.API_KEY_INVALID, provider: 'unknown' }
                }));
              } else if (statusCode === 429) {
                error(new TRPCError({
                  code: 'TOO_MANY_REQUESTS',
                  message: 'Rate limit exceeded. Please try again later.',
                  cause: { errorCode: ErrorCode.RATE_LIMIT_EXCEEDED, provider: 'unknown' }
                }));
              } else if (statusCode === 402) {
                error(new TRPCError({
                  code: 'FORBIDDEN',
                  message: 'Quota exceeded. Please check your billing.',
                  cause: { errorCode: ErrorCode.QUOTA_EXCEEDED, provider: 'unknown' }
                }));
              } else {
                error(new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: errorMessage,
                  cause: { errorCode: ErrorCode.PROVIDER_UNAVAILABLE, provider: 'unknown' }
                }));
              }
            }
          } finally {
            // Always cleanup the stream from registry when done
            streamAbortRegistry.cleanup(streamId);
          }
        };

        // Create isolated iterator with streaming process, so that if request drops; request can still complete
        const iterator = createIsolatedIterator<StreamMessage>(streamAIResponse);

        // Forward items to the client only while the connection is active
        for await (const item of iterator) {
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
      const syncDate = calculateSyncDate(direction, messages, cursor);

      return {
        messages: messages as MessageType[],
        direction,
        syncDate,
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

}); 