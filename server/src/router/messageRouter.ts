import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { PrismaClient, type Message } from "@prisma/client";
import { cacheHelpers } from "../lib/redis";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  // Send a message and get AI response (no streaming)
  send: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string().optional(),
        content: z.string().min(1, "Message content is required"),
        from: z.enum(["user", "assistant"]).default("user")
      })
    )
    .mutation(async ({ input, ctx }) => {
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

        // Invalidate chat cache
        await Promise.all([
          cacheHelpers.invalidateChat(chatId),
          cacheHelpers.invalidateOwnerCache(ctx.owner.id),
        ]);

        // Return user message and chat info - AI response will be handled by streaming query
        return {
          userMessage: userMessage,
          chatId: chatId,
          chat: chat,
          success: true,
        };
      } catch (error) {
        console.error("Error in message processing:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to process message"
        );
      }
    }),

  // Stream AI response for a given user message
  streamAIResponse: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string(),
        userMessageId: z.string(),
        modelId: z.string().optional(),
      })
    )
    .query(async function* ({ input, ctx }) {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }



      const { chatId, userMessageId } = input;

      // Query the model from the database if modelId is provided
      let modelToUse = "gpt-4o-mini"; // Default fallback
      if (input.modelId) {
        const model = await prisma.modelCatalog.findUnique({
          where: { id: input.modelId },
          select: { provider: true, name: true },
        });

        if (model) {
          console.log("Found model:", model);
          if (model.provider === "openai") {
            modelToUse = model.name;
            console.log("Using OpenAI model:", modelToUse);
          } else if (model.provider === "anthropic") {
            modelToUse = model.name;
            console.log("Using Anthropic model:", modelToUse);
          } else {
            console.log("Unsupported provider detected:", model.provider);
            throw new Error(`Provider "${model.provider}" is not currently supported`);
          }
        } else {
          console.log("Model not found, using fallback:", modelToUse);
        }
      }

      // Verify chat belongs to the owner
      const chat = await prisma.chat.findFirst({
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

      // Verify the user message exists
      const userMessage = await prisma.message.findFirst({
        where: {
          id: userMessageId,
          chatId: chatId,
          from: "user",
        },
      });

      if (!userMessage) {
        throw new Error("User message not found");
      }

      try {
        // Prepare conversation history for OpenAI
        const conversationHistory = chat.messages.map((msg) => ({
          role: msg.from as "user" | "assistant",
          content: msg.content,
        }));

        // Add the new user message if it's not already in the history
        const userMessageExists = chat.messages.some(msg => msg.id === userMessageId);
        if (!userMessageExists) {
          conversationHistory.push({
            role: "user",
            content: userMessage.content,
          });
        }

        // Create a placeholder AI message in the database
        const aiMessage = await prisma.message.create({
          data: {
            content: "",
            from: "assistant",
            text: "",
            chatId: chatId,
          },
        });

        // Yield the initial AI message
        yield {
          type: "aiMessageStart" as const,
          message: aiMessage as MessageType,
        };

        let fullContent = "";

        // Determine the provider from the model query result
        const selectedProvider = input.modelId ?
          (await prisma.modelCatalog.findUnique({
            where: { id: input.modelId },
            select: { provider: true },
          }))?.provider || "openai" : "openai";

        if (selectedProvider === "anthropic") {
          console.log("Streaming with Anthropic API");

          // Convert and filter conversation history for Anthropic API
          const anthropicMessages = conversationHistory
            .filter(msg => msg.content && msg.content.trim().length > 0) // Filter out empty messages
            .map(msg => ({
              role: msg.role === "assistant" ? "assistant" as const : "user" as const,
              content: msg.content.trim()
            }));

          console.log("Anthropic messages:", JSON.stringify(anthropicMessages, null, 2));
          console.log("Using Anthropic model:", modelToUse);

          // Get streaming response from Anthropic
          const stream = await anthropic.messages.create({
            model: modelToUse,
            messages: anthropicMessages,
            max_tokens: 4096,
            stream: true,
          });

          // Stream the response chunks from Anthropic
          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              const delta = chunk.delta.text;
              fullContent += delta;

              yield {
                type: "aiMessageChunk" as const,
                messageId: aiMessage.id,
                chunk: delta,
                fullContent,
              };
            }
          }
        } else {
          console.log("Streaming with OpenAI API");

          // // Get streaming response from OpenAI
          const completion = await openai.chat.completions.create({
            model: modelToUse,
            messages: conversationHistory,
            max_tokens: 4096,
            temperature: 0.7,
            stream: true,
          });

          // Stream the response chunks from OpenAI
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;

              yield {
                type: "aiMessageChunk" as const,
                messageId: aiMessage.id,
                chunk: delta,
                fullContent,
              };
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

        // Yield the final complete message
        yield {
          type: "aiMessageComplete" as const,
          message: updatedAiMessage as MessageType,
        };

        // Invalidate chat cache
        await Promise.all([
          cacheHelpers.invalidateChat(chatId),
          cacheHelpers.invalidateOwnerCache(ctx.owner.id),
        ]);

      } catch (error) {
        console.error("Error in AI response streaming:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to stream AI response"
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
    })
}); 