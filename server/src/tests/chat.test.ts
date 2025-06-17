import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { setupTRPCClient } from './utils/setupTRPCClient';
import { cleanupDatabase, closeDatabaseConnection } from './utils/testCleanup';

// Mock the tracker service
vi.mock('../services/tracker.service', () => ({
  updateTracker: vi.fn().mockResolvedValue(undefined)
}));

describe('Chat tRPC Integration Tests', () => {
  // Test clients - one authenticated and one anonymous
  let authenticatedClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let authenticatedCookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];
  
  let anonymousClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let anonymousCookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

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
    // Clean database before each test to ensure clean state
    await cleanupDatabase();
    
    // Clear cookies before each test to ensure clean state
    authenticatedCookieJar.clear();
    anonymousCookieJar.clear();
  });

  afterAll(async () => {
    // Close database connection after all tests
    await closeDatabaseConnection();
  });

  describe('Chat Creation', () => {
    it('should create a chat for authenticated user', async () => {
      const chatData = {
        title: 'Test Chat',
        description: 'This is a test chat'
      };

      const result = await authenticatedClient.chat.create.mutate(chatData);

      expect(result).toMatchObject({
        id: expect.any(String),
        title: chatData.title,
        description: chatData.description,
        isDeleted: false,
        createdAt: expect.any(String),
        ownerId: expect.any(String),
      });

      expect(result.owner).toBeDefined();
      expect(result.messages).toEqual([]);
    });

    it('should create a chat for anonymous user', async () => {
      const chatData = {
        title: 'Anonymous Chat',
        description: 'Chat by anonymous user'
      };

      const result = await anonymousClient.chat.create.mutate(chatData);

      expect(result).toMatchObject({
        id: expect.any(String),
        title: chatData.title,
        description: chatData.description,
        isDeleted: false,
        createdAt: expect.any(String),
        ownerId: expect.any(String),
      });

             expect(result.owner).toBeDefined();
       expect(result.owner?.anonUser).toBeDefined();
      expect(result.messages).toEqual([]);
    });

    it('should create chat with default empty description', async () => {
      const chatData = {
        title: 'Chat Without Description'
      };

      const result = await authenticatedClient.chat.create.mutate(chatData);

      expect(result.title).toBe(chatData.title);
      expect(result.description).toBe('');
    });

    it('should validate required title field', async () => {
      const chatData = {
        title: '', // Empty title should fail validation
        description: 'Description'
      };

      await expect(
        authenticatedClient.chat.create.mutate(chatData)
      ).rejects.toThrow();
    });
  });

  describe('Chat Listing', () => {
    it('should list chats for authenticated user', async () => {
      // Create a few chats first
      await authenticatedClient.chat.create.mutate({
        title: 'Chat 1',
        description: 'First chat'
      });

      await authenticatedClient.chat.create.mutate({
        title: 'Chat 2',
        description: 'Second chat'
      });

      const result = await authenticatedClient.chat.getAll.query();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
        isDeleted: false,
        messages: expect.any(Array),
        _count: {
          messages: expect.any(Number)
        }
      });

             // Should be ordered by creation date (newest first)
       expect(result[0]?.title).toBe('Chat 2');
       expect(result[1]?.title).toBe('Chat 1');
    });

    it('should list chats for anonymous user', async () => {
      // Create a chat for anonymous user
      await anonymousClient.chat.create.mutate({
        title: 'Anonymous Chat',
        description: 'Chat by anon user'
      });

      const result = await anonymousClient.chat.getAll.query();

             expect(result).toHaveLength(1);
       expect(result[0]?.title).toBe('Anonymous Chat');
    });

    it('should return empty array when no chats exist', async () => {
      const result = await authenticatedClient.chat.getAll.query();
      expect(result).toEqual([]);
    });

    it('should not show deleted chats', async () => {
      // Create and then delete a chat
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Chat to Delete',
        description: 'Will be deleted'
      });

      await authenticatedClient.chat.delete.mutate({ id: chat.id });

      const result = await authenticatedClient.chat.getAll.query();
      expect(result).toEqual([]);
    });

    it('should isolate chats between authenticated and anonymous users', async () => {
      // Create chat for authenticated user
      await authenticatedClient.chat.create.mutate({
        title: 'Auth User Chat',
        description: 'Only for auth user'
      });

      // Create chat for anonymous user
      await anonymousClient.chat.create.mutate({
        title: 'Anon User Chat',
        description: 'Only for anon user'
      });

             // Each should only see their own chat
       const authChats = await authenticatedClient.chat.getAll.query();
       const anonChats = await anonymousClient.chat.getAll.query();

       expect(authChats).toHaveLength(1);
       expect(authChats[0]?.title).toBe('Auth User Chat');

       expect(anonChats).toHaveLength(1);
       expect(anonChats[0]?.title).toBe('Anon User Chat');
    });
  });

  describe('Chat Update', () => {
    it('should update chat title for authenticated user', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Original Title',
        description: 'Original description'
      });

      // Update the title
      const updatedChat = await authenticatedClient.chat.update.mutate({
        id: chat.id,
        title: 'Updated Title'
      });

      expect(updatedChat.title).toBe('Updated Title');
      expect(updatedChat.description).toBe('Original description'); // Should remain unchanged
      expect(updatedChat.id).toBe(chat.id);
    });

    it('should update chat description for authenticated user', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Test Title',
        description: 'Original description'
      });

      // Update the description
      const updatedChat = await authenticatedClient.chat.update.mutate({
        id: chat.id,
        description: 'Updated description'
      });

      expect(updatedChat.title).toBe('Test Title'); // Should remain unchanged
      expect(updatedChat.description).toBe('Updated description');
      expect(updatedChat.id).toBe(chat.id);
    });

    it('should update both title and description', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Original Title',
        description: 'Original description'
      });

      // Update both fields
      const updatedChat = await authenticatedClient.chat.update.mutate({
        id: chat.id,
        title: 'New Title',
        description: 'New description'
      });

      expect(updatedChat.title).toBe('New Title');
      expect(updatedChat.description).toBe('New description');
      expect(updatedChat.id).toBe(chat.id);
    });

    it('should update chat title for anonymous user', async () => {
      // Create a chat as anonymous user first
      const chat = await anonymousClient.chat.create.mutate({
        title: 'Anon Original Title',
        description: 'Anon description'
      });

      // Update the title
      const updatedChat = await anonymousClient.chat.update.mutate({
        id: chat.id,
        title: 'Anon Updated Title'
      });

      expect(updatedChat.title).toBe('Anon Updated Title');
      expect(updatedChat.description).toBe('Anon description');
    });

    it('should validate title when updating', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Valid Title',
        description: 'Description'
      });

      // Try to update with empty title
      await expect(
        authenticatedClient.chat.update.mutate({
          id: chat.id,
          title: '' // Empty title should fail validation
        })
      ).rejects.toThrow();
    });

    it('should prevent updating other users chats', async () => {
      // Create a chat as authenticated user
      const authChat = await authenticatedClient.chat.create.mutate({
        title: 'Auth User Chat',
        description: 'Belongs to auth user'
      });

      // Try to update it as anonymous user (should fail)
      await expect(
        anonymousClient.chat.update.mutate({
          id: authChat.id,
          title: 'Hacked Title'
        })
      ).rejects.toThrow();
    });

    it('should prevent updating non-existent chat', async () => {
      await expect(
        authenticatedClient.chat.update.mutate({
          id: 'non-existent-id',
          title: 'New Title'
        })
      ).rejects.toThrow();
    });

    it('should prevent updating deleted chat', async () => {
      // Create and delete a chat
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Chat to Delete',
        description: 'Will be deleted'
      });

      await authenticatedClient.chat.delete.mutate({ id: chat.id });

      // Try to update the deleted chat
      await expect(
        authenticatedClient.chat.update.mutate({
          id: chat.id,
          title: 'Updated Title'
        })
      ).rejects.toThrow();
    });
  });

  describe('Chat Retrieval by ID', () => {
    it('should get specific chat by ID for authenticated user', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Specific Chat',
        description: 'Get this specific chat'
      });

      const result = await authenticatedClient.chat.getById.query({ id: chat.id });

      expect(result).toMatchObject({
        id: chat.id,
        title: 'Specific Chat',
        description: 'Get this specific chat',
        isDeleted: false,
        messages: expect.any(Array),
        owner: expect.objectContaining({
          id: expect.any(String)
        })
      });
    });

    it('should prevent accessing other users chats', async () => {
      // Create a chat as authenticated user
      const authChat = await authenticatedClient.chat.create.mutate({
        title: 'Auth User Chat',
        description: 'Private chat'
      });

      // Try to access it as anonymous user (should fail)
      await expect(
        anonymousClient.chat.getById.query({ id: authChat.id })
      ).rejects.toThrow();
    });

    it('should prevent accessing non-existent chat', async () => {
      await expect(
        authenticatedClient.chat.getById.query({ id: 'non-existent-id' })
      ).rejects.toThrow();
    });
  });

  describe('Chat Deletion', () => {
    it('should delete chat for authenticated user', async () => {
      // Create a chat first
      const chat = await authenticatedClient.chat.create.mutate({
        title: 'Chat to Delete',
        description: 'This will be deleted'
      });

      const result = await authenticatedClient.chat.delete.mutate({ id: chat.id });

      expect(result).toMatchObject({
        success: true,
        chatId: chat.id
      });

      // Verify chat is no longer in the list
      const chats = await authenticatedClient.chat.getAll.query();
      expect(chats).toEqual([]);
    });

    it('should prevent deleting other users chats', async () => {
      // Create a chat as authenticated user
      const authChat = await authenticatedClient.chat.create.mutate({
        title: 'Auth User Chat',
        description: 'Cannot be deleted by others'
      });

      // Try to delete it as anonymous user (should fail)
      await expect(
        anonymousClient.chat.delete.mutate({ id: authChat.id })
      ).rejects.toThrow();
    });

    it('should prevent deleting non-existent chat', async () => {
      await expect(
        authenticatedClient.chat.delete.mutate({ id: 'non-existent-id' })
      ).rejects.toThrow();
    });
  });

  describe('Chat Delete All', () => {
    it('should delete all chats for authenticated user', async () => {
      // Create multiple chats
      await authenticatedClient.chat.create.mutate({ title: 'Chat 1' });
      await authenticatedClient.chat.create.mutate({ title: 'Chat 2' });
      await authenticatedClient.chat.create.mutate({ title: 'Chat 3' });

      const result = await authenticatedClient.chat.deleteAll.mutate();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);

      // Verify all chats are deleted
      const allChats = await authenticatedClient.chat.getAll.query();
      expect(allChats.chats).toHaveLength(0);
    });

    it('should delete all chats for anonymous user', async () => {
      // Create multiple chats for anonymous user
      await anonymousClient.chat.create.mutate({ title: 'Anonymous Chat 1' });
      await anonymousClient.chat.create.mutate({ title: 'Anonymous Chat 2' });

      const result = await anonymousClient.chat.deleteAll.mutate();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);

      // Verify all chats are deleted
      const allChats = await anonymousClient.chat.getAll.query();
      expect(allChats.chats).toHaveLength(0);
    });

    it('should only delete chats for current user, not other users', async () => {
      // Create chats for both authenticated and anonymous users
      await authenticatedClient.chat.create.mutate({ title: 'Auth Chat 1' });
      await authenticatedClient.chat.create.mutate({ title: 'Auth Chat 2' });
      await anonymousClient.chat.create.mutate({ title: 'Anon Chat 1' });
      await anonymousClient.chat.create.mutate({ title: 'Anon Chat 2' });

      // Delete all chats for authenticated user
      const result = await authenticatedClient.chat.deleteAll.mutate();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);

      // Verify authenticated user has no chats
      const authChats = await authenticatedClient.chat.getAll.query();
      expect(authChats.chats).toHaveLength(0);

      // Verify anonymous user still has chats
      const anonChats = await anonymousClient.chat.getAll.query();
      expect(anonChats.chats).toHaveLength(2);
    });

    it('should return 0 count when no chats exist', async () => {
      const result = await authenticatedClient.chat.deleteAll.mutate();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });
}); 