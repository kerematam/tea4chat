import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { PrismaClient } from "@prisma/client";
import { cacheHelpers } from "../lib/redis";

const prisma = new PrismaClient();

export const chatRouter = router({
  // Query all chats for the current user/session with pagination
  getAll: withOwnerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        cursor: z.string().optional(), // cursor for pagination
      }).optional().default({})
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.owner) {
        return {
          chats: [],
          hasMore: false,
          nextCursor: null,
        };
      }

      const { limit, cursor } = input;

      // Try to get from cache first
      const cachedResult = await cacheHelpers.getChatList(ctx.owner.id, limit, cursor);
      if (cachedResult) {
        return cachedResult;
      }

      const chats = await prisma.chat.findMany({
        where: {
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1, // Take one extra to determine if there are more
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0, // Skip the cursor item itself
      });

      const hasMore = chats.length > limit;
      const chatList = hasMore ? chats.slice(0, -1) : chats;
      const nextCursor = hasMore ? chats[chats.length - 2]?.id : null;

      const result = {
        chats: chatList,
        hasMore,
        nextCursor,
      };

      await cacheHelpers.setChatList(ctx.owner.id, limit, cursor, result, 300);

      return result;
    }),

  // Get a specific chat by ID
  getById: withOwnerProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      const cachedChat = await cacheHelpers.getChat(input.id);
      if (cachedChat && cachedChat.ownerId === ctx.owner.id && !cachedChat.isDeleted) {
        return cachedChat;
      }

      const chat = await prisma.chat.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
          owner: {
            include: {
              user: true,
              anonUser: true,
            },
          },
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      // Cache the chat for 10 minutes
      await cacheHelpers.setChat(input.id, chat, 600);

      return chat;
    }),

  // Delete a chat (soft delete)
  delete: withOwnerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Verify the chat belongs to the user/session
      const chat = await prisma.chat.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      // Soft delete the chat
      const deletedChat = await prisma.chat.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      // Invalidate cache for this owner and specific chat
      await Promise.all([
        cacheHelpers.invalidateOwnerCache(ctx.owner.id),
        cacheHelpers.invalidateChat(input.id)
      ]);

      return { success: true, chatId: deletedChat.id };
    }),

  // Delete all chats for the current user/owner (soft delete)
  deleteAll: withOwnerProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Soft delete all chats belonging to the owner
      const result = await prisma.chat.updateMany({
        where: {
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
        data: {
          isDeleted: true,
        },
      });

      // Invalidate all cache for this owner
      await cacheHelpers.invalidateOwnerCache(ctx.owner.id);

      return {
        success: true,
        deletedCount: result.count
      };
    }),

  // Update chat title/description
  update: withOwnerProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1, "Chat title is required").optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Verify the chat belongs to the user/session
      const existingChat = await prisma.chat.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
      });

      if (!existingChat) {
        throw new Error("Chat not found");
      }

      // Update the chat
      const updateData: { title?: string; description?: string } = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;

      const updatedChat = await prisma.chat.update({
        where: { id: input.id },
        data: updateData,
        include: {
          owner: {
            include: {
              user: true,
              anonUser: true,
            },
          },
          messages: true,
        },
      });

      // Invalidate cache for this owner and specific chat
      await Promise.all([
        cacheHelpers.invalidateOwnerCache(ctx.owner.id),
        cacheHelpers.invalidateChat(input.id)
      ]);

      return updatedChat;
    }),

  // Export all chats for the current user/owner
  export: withOwnerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Get all chats with their messages for this owner
      const chats = await prisma.chat.findMany({
        where: {
          ownerId: ctx.owner.id,
          isDeleted: false,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              model: {
                select: {
                  id: true,
                  name: true,
                  provider: true,
                },
              },
            },
          },
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Get owner info for context
      const ownerInfo = await prisma.owner.findUnique({
        where: { id: ctx.owner.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          anonUser: {
            select: {
              id: true,
              sessionId: true,
            },
          },
        },
      });

      // Format the export data
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        owner: {
          id: ctx.owner.id,
          type: ownerInfo?.user ? "authenticated" : "anonymous",
          user: ownerInfo?.user || null,
          anonUser: ownerInfo?.anonUser || null,
        },
        stats: {
          totalChats: chats.length,
          totalMessages: chats.reduce((acc, chat) => acc + chat.messages.length, 0),
        },
        chats: chats.map(chat => ({
          id: chat.id,
          title: chat.title,
          description: chat.description,
          createdAt: chat.createdAt.toISOString(),
          model: chat.model,
          messageCount: chat.messages.length,
          messages: chat.messages.map(message => ({
            id: message.id,
            content: message.content,
            from: message.from,
            text: message.text,
            model: message.model,
            createdAt: message.createdAt.toISOString(),
          })),
        })),
      };

      return exportData;
    }),

  // Import chats from JSON data
  import: withOwnerProcedure
    .input(
      z.object({
        jsonData: z.string().min(1, "JSON data is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      let parsedData;
      try {
        parsedData = JSON.parse(input.jsonData);
      } catch (error) {
        throw new Error("Invalid JSON format");
      }

      // Validate the structure of the imported data
      if (!parsedData.chats || !Array.isArray(parsedData.chats)) {
        throw new Error("Invalid export format: 'chats' array is required");
      }

      const importResults = {
        successful: 0,
        failed: 0,
        errors: [] as string[],
        importedChatIds: [] as string[],
      };

      // Validate all chats first and prepare data
      const validChats = [];
      for (const chatData of parsedData.chats) {
        if (!chatData.title || !chatData.messages || !Array.isArray(chatData.messages)) {
          importResults.failed++;
          importResults.errors.push(`Chat "${chatData.title || 'Untitled'}" is missing required fields`);
          continue;
        }
        validChats.push(chatData);
      }

      if (validChats.length === 0) {
        return {
          success: true,
          results: importResults,
          message: `Import completed: ${importResults.successful} chats imported successfully, ${importResults.failed} failed`,
        };
      }

      try {
        // Prepare all chat data for batch creation
        const chatsToCreate = validChats.map(chatData => {
          const chatCreatedAt = chatData.createdAt ? new Date(chatData.createdAt) : new Date();
          return {
            title: chatData.title,
            description: chatData.description || "",
            ownerId: ctx.owner!.id, // We already checked ctx.owner exists above
            createdAt: chatCreatedAt,
            // Note: We're not importing modelId to avoid reference issues
          };
        });

        // Batch create all chats
        const createdChats = await prisma.chat.createManyAndReturn({
          data: chatsToCreate,
        });

        // Now prepare all messages for batch creation
        const allMessagesToCreate = [];
        for (let i = 0; i < validChats.length; i++) {
          const chatData = validChats[i];
          const createdChat = createdChats[i];
          if (!createdChat) {
            console.error(`Created chat at index ${i} is undefined`);
            continue;
          }
          const chatCreatedAt = chatData.createdAt ? new Date(chatData.createdAt) : new Date();

          if (chatData.messages.length > 0) {
            const messagesForThisChat = chatData.messages.map((messageData: any, messageIndex: number) => {
              // Preserve original createdAt timestamp if available, otherwise use incremental timestamps
              const messageCreatedAt = messageData.createdAt 
                ? new Date(messageData.createdAt) 
                : new Date(chatCreatedAt.getTime() + (messageIndex * 1000)); // Add 1 second per message for ordering
              
              return {
                content: messageData.content || "",
                from: messageData.from || "user",
                text: messageData.text || null,
                chatId: createdChat.id,
                createdAt: messageCreatedAt,
                // Note: We're not importing modelId to avoid reference issues
              };
            });
            
            allMessagesToCreate.push(...messagesForThisChat);
          }
        }

        // Batch insert ALL messages at once
        if (allMessagesToCreate.length > 0) {
          await prisma.message.createMany({
            data: allMessagesToCreate,
          });
        }

        // Update success metrics
        importResults.successful = createdChats.length;
        importResults.importedChatIds = createdChats.map(chat => chat.id);

      } catch (error) {
        importResults.failed = validChats.length;
        importResults.errors.push(`Batch import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error("Batch import error:", error);
      }

      // Invalidate cache for this owner after import
      await cacheHelpers.invalidateOwnerCache(ctx.owner.id);

      return {
        success: true,
        results: importResults,
        message: `Import completed: ${importResults.successful} chats imported successfully, ${importResults.failed} failed`,
      };
    }),

  // Get unsynced anonymous chats that can be imported to the current authenticated user
  getUnsyncedAnonymousChats: withOwnerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Only works for authenticated users (not anonymous users)
      if (!ctx.owner.userId || !ctx.tracker) {
        return {
          chats: [],
          stats: {
            totalChats: 0,
            totalMessages: 0,
            oldestSession: null,
            newestSession: null,
          }
        };
      }

      // More efficient: Get all trackers with the same session ID directly
      const allSessionTrackers = await prisma.tracker.findMany({
        where: {
          sessionId: ctx.tracker.sessionId,
        },
        select: {
          sessionId: true,
          firstSeen: true,
          lastSeen: true,
        },
        orderBy: {
          lastSeen: 'desc'
        }
      });

      // Find anonymous users that used the same session ID
      const anonymousUsers = await prisma.anonUser.findMany({
        where: {
          sessionId: ctx.tracker.sessionId,
          // Make sure they have an owner (chats)
          owner: {
            isNot: null
          }
        },
        include: {
          owner: {
            include: {
              chats: {
                where: {
                  isDeleted: false
                },
                include: {
                  messages: {
                    orderBy: { createdAt: "asc" },
                    include: {
                      model: {
                        select: {
                          id: true,
                          name: true,
                          provider: true,
                        },
                      },
                    },
                  },
                  _count: {
                    select: { messages: true },
                  },
                  model: {
                    select: {
                      id: true,
                      name: true,
                      provider: true,
                    },
                  },
                },
                orderBy: { createdAt: "desc" },
              }
            }
          }
        }
      });

      // Flatten all chats from all anonymous sessions
      const allAnonymousChats = anonymousUsers.flatMap(anonUser => 
        anonUser.owner?.chats || []
      );

      // Calculate statistics
      const totalMessages = allAnonymousChats.reduce((acc, chat) => acc + chat.messages.length, 0);
      const oldestSession = allSessionTrackers.reduce((oldest, tracker) => 
        !oldest || tracker.firstSeen < oldest ? tracker.firstSeen : oldest, 
        null as Date | null
      );
      const newestSession = allSessionTrackers.reduce((newest, tracker) => 
        !newest || tracker.lastSeen > newest ? tracker.lastSeen : newest, 
        null as Date | null
      );

      return {
        chats: allAnonymousChats.map(chat => ({
          id: chat.id,
          title: chat.title,
          description: chat.description,
          createdAt: chat.createdAt.toISOString(),
          model: chat.model,
          messageCount: chat._count.messages,
          messages: chat.messages.map(message => ({
            id: message.id,
            content: message.content,
            from: message.from,
            text: message.text,
            model: message.model,
            createdAt: message.createdAt.toISOString(),
          })),
          // Include the anonymous session info for reference
          anonymousOwner: {
            id: chat.ownerId,
            sessionId: anonymousUsers.find(au => au.owner?.id === chat.ownerId)?.sessionId,
          }
        })),
        stats: {
          totalChats: allAnonymousChats.length,
          totalMessages,
          oldestSession: oldestSession?.toISOString() || null,
          newestSession: newestSession?.toISOString() || null,
        }
      };
    }),

  // Import/sync anonymous chats to the current authenticated user
  syncAnonymousChats: withOwnerProcedure
    .input(
      z.object({
        chatIds: z.array(z.string()).optional(), // If provided, only sync these chat IDs. If not, sync all unsynced chats
      }).optional().default({})
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Only works for authenticated users (not anonymous users)
      if (!ctx.owner.userId || !ctx.tracker) {
        throw new Error("Can only sync to authenticated accounts");
      }

      // More efficient: Find anonymous users that used the same session ID directly
      const anonymousUsers = await prisma.anonUser.findMany({
        where: {
          sessionId: ctx.tracker.sessionId,
          owner: {
            isNot: null
          }
        },
        include: {
          owner: {
            include: {
              chats: {
                where: {
                  isDeleted: false
                },
                include: {
                  _count: {
                    select: { messages: true },
                  },
                },
              }
            }
          }
        }
      });

      // Flatten all chats from all anonymous sessions
      const allAnonymousChats = anonymousUsers.flatMap(anonUser => 
        anonUser.owner?.chats || []
      );

      if (allAnonymousChats.length === 0) {
        return {
          success: true,
          syncedChats: 0,
          syncedMessages: 0,
          message: "No anonymous chats found to sync"
        };
      }

      // Filter chats to sync based on input
      const chatsToSync = input.chatIds && input.chatIds.length > 0
        ? allAnonymousChats.filter(chat => input.chatIds!.includes(chat.id))
        : allAnonymousChats;

      if (chatsToSync.length === 0) {
        return {
          success: true,
          syncedChats: 0,
          syncedMessages: 0,
          message: "No matching chats found to sync"
        };
      }

      let syncedChats = 0;
      let syncedMessages = 0;

      // Transfer ownership of each chat to the authenticated user's owner
      for (const chatData of chatsToSync) {
        try {
          // Update the chat to belong to the authenticated user's owner
          await prisma.chat.update({
            where: { id: chatData.id },
            data: { ownerId: ctx.owner.id }
          });

          syncedChats++;
          syncedMessages += chatData._count.messages;
        } catch (error) {
          console.error(`Failed to sync chat ${chatData.id}:`, error);
        }
      }

      // Invalidate cache for this owner after sync
      await cacheHelpers.invalidateOwnerCache(ctx.owner.id);

      return {
        success: true,
        syncedChats,
        syncedMessages,
        message: `Successfully synced ${syncedChats} chats with ${syncedMessages} messages`
      };
    }),

  // Create a new chat
  create: withOwnerProcedure
    .input(
      z.object({
        title: z.string().min(1, "Chat title is required"),
        description: z.string().optional().default(""),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      const newChat = await prisma.chat.create({
        data: {
          title: input.title,
          description: input.description,
          ownerId: ctx.owner.id,
        },
        include: {
          messages: true,
          owner: {
            include: {
              user: true,
              anonUser: true,
            },
          },
        },
      });

      // Invalidate cache for this owner
      await cacheHelpers.invalidateOwnerCache(ctx.owner.id);

      return newChat;
    }),
});
