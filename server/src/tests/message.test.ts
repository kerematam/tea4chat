import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { setupTRPCClient } from './utils/setupTRPCClient';
import { cleanupDatabase, closeDatabaseConnection } from './utils/testCleanup';

// Mock the tracker service
vi.mock('../services/tracker.service', () => ({
  updateTracker: vi.fn().mockResolvedValue(undefined)
}));

// Mock OpenAI for testing
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: "This is a mocked AI response for testing"
                }
              }
            ]
          })
        }
      }
    }))
  };
});

describe("Message Router", () => {
  let authenticatedClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let authenticatedCookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];
  
  let anonymousClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let anonymousCookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

  let chatId: string;

  beforeAll(() => {
    // Setup authenticated client (bypasses auth for testing)
    const authSetup = setupTRPCClient({ byPassAuth: true });
    authenticatedClient = authSetup.trpcClient;
    authenticatedCookieJar = authSetup.cookieJar;

    // Setup anonymous client
    const anonSetup = setupTRPCClient({ byPassAuth: false });
    anonymousClient = anonSetup.trpcClient;
    anonymousCookieJar = anonSetup.cookieJar;
  });

  beforeEach(async () => {
    await cleanupDatabase();
    
    // Clear cookies before each test
    authenticatedCookieJar.clear();
    anonymousCookieJar.clear();
    
    // Create a test chat first
    const chat = await authenticatedClient.chat.create.mutate({
      title: "Test Chat for Messages",
      description: "Test chat description",
    });
    
    chatId = chat.id;
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  describe("send", () => {
    it("should send a message and get AI response", async () => {
      const result = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Hello, how are you?",
      });

      expect(result.success).toBe(true);
      expect(result.userMessage).toBeDefined();
      expect(result.userMessage.content).toBe("Hello, how are you?");
      expect(result.userMessage.from).toBe("user");
      expect(result.userMessage.chatId).toBe(chatId);

      expect(result.aiMessage).toBeDefined();
      expect(result.aiMessage.from).toBe("assistant");
      expect(result.aiMessage.chatId).toBe(chatId);
      expect(result.aiMessage.content).toBe("This is a mocked AI response for testing");
    });

    it("should throw error for non-existent chat", async () => {
      await expect(
        authenticatedClient.message.send.mutate({
          chatId: "non-existent-id",
          content: "Hello",
        })
      ).rejects.toThrow("Chat not found");
    });

    it("should throw error for empty content", async () => {
      await expect(
        authenticatedClient.message.send.mutate({
          chatId,
          content: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("getMessages", () => {
    it("should retrieve messages for a chat", async () => {
      // First send a message
      await authenticatedClient.message.send.mutate({
        chatId,
        content: "Test message",
      });

      const result = await authenticatedClient.message.getMessages.query({
        chatId,
        limit: 10,
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]?.content).toBe("Test message");
      expect(result.messages[0]?.from).toBe("user");
    });

    it("should handle pagination", async () => {
      // Send multiple messages
      for (let i = 1; i <= 5; i++) {
        await authenticatedClient.message.send.mutate({
          chatId,
          content: `Message ${i}`,
        });
      }

      const result = await authenticatedClient.message.getMessages.query({
        chatId,
        limit: 3,
      });

      expect(result.messages.length).toBeLessThanOrEqual(3);
      expect(result.hasMore).toBeDefined();
    });

    it("should throw error for non-existent chat", async () => {
      await expect(
        authenticatedClient.message.getMessages.query({
          chatId: "non-existent-id",
        })
      ).rejects.toThrow("Chat not found");
    });
  });

  describe("getById", () => {
    it("should get a specific message by ID", async () => {
      const sendResult = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Test message for getById",
      });

      const message = await authenticatedClient.message.getById.query({
        id: sendResult.userMessage.id,
      });

      expect(message.id).toBe(sendResult.userMessage.id);
      expect(message.content).toBe("Test message for getById");
      expect(message.from).toBe("user");
    });

    it("should throw error for non-existent message", async () => {
      await expect(
        authenticatedClient.message.getById.query({
          id: "non-existent-id",
        })
      ).rejects.toThrow("Message not found");
    });
  });

  describe("update", () => {
    it("should update a message", async () => {
      const sendResult = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Original message",
      });

      const updatedMessage = await authenticatedClient.message.update.mutate({
        id: sendResult.userMessage.id,
        content: "Updated message content",
      });

      expect(updatedMessage.content).toBe("Updated message content");
      expect(updatedMessage.id).toBe(sendResult.userMessage.id);
    });

    it("should throw error for non-existent message", async () => {
      await expect(
        authenticatedClient.message.update.mutate({
          id: "non-existent-id",
          content: "New content",
        })
      ).rejects.toThrow("Message not found");
    });

    it("should throw error for empty content", async () => {
      const sendResult = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Original message",
      });

      await expect(
        authenticatedClient.message.update.mutate({
          id: sendResult.userMessage.id,
          content: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("should delete a message", async () => {
      const sendResult = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Message to delete",
      });

      const deleteResult = await authenticatedClient.message.delete.mutate({
        id: sendResult.userMessage.id,
      });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.messageId).toBe(sendResult.userMessage.id);

      // Verify message is deleted
      await expect(
        authenticatedClient.message.getById.query({
          id: sendResult.userMessage.id,
        })
      ).rejects.toThrow("Message not found");
    });

    it("should throw error for non-existent message", async () => {
      await expect(
        authenticatedClient.message.delete.mutate({
          id: "non-existent-id",
        })
      ).rejects.toThrow("Message not found");
    });
  });

  describe("ownership verification", () => {
    it("should not allow access to messages from other owners", async () => {
      // Create a chat and message with authenticated user
      const sendResult = await authenticatedClient.message.send.mutate({
        chatId,
        content: "Private message",
      });

      // Try to access the message with anonymous user
      await expect(
        anonymousClient.message.getById.query({
          id: sendResult.userMessage.id,
        })
      ).rejects.toThrow("Message not found");
    });
  });
}); 