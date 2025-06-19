import Redis from 'ioredis';

// Create Redis client with configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Create separate Redis client for pub/sub (required for Redis pub/sub)
const redisPubSub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Handle Redis connection events
redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('ready', () => {
  console.log('Redis is ready to accept commands');
});

redisPubSub.on('connect', () => {
  console.log('Redis Pub/Sub connected successfully');
});

redisPubSub.on('error', (error) => {
  console.error('Redis Pub/Sub connection error:', error);
});

// Helper functions for common cache operations
export const cacheHelpers = {
  // Cache keys
  keys: {
    chatList: (ownerId: string, limit: number, cursor?: string) => 
      `chat:list:${ownerId}:${limit}:${cursor || 'initial'}`,
    chat: (chatId: string) => `chat:${chatId}`,
    ownerChats: (ownerId: string) => `owner:${ownerId}:chats`,
    ownerSettings: (ownerId: string) => `owner:${ownerId}:settings`,
    // Streaming keys
    streamChannel: (chatId: string) => `stream:${chatId}`,
    activeStream: (chatId: string) => `stream:active:${chatId}`,
    streamMessage: (chatId: string, messageId: string) => `stream:message:${chatId}:${messageId}`,
  },

  // Cache a chat list with expiration
  setChatList: async (ownerId: string, limit: number, cursor: string | undefined, data: any, ttlSeconds = 300) => {
    const key = cacheHelpers.keys.chatList(ownerId, limit, cursor);
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  },

  // Get cached chat list
  getChatList: async (ownerId: string, limit: number, cursor: string | undefined) => {
    const key = cacheHelpers.keys.chatList(ownerId, limit, cursor);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  },

  // Cache a single chat
  setChat: async (chatId: string, data: any, ttlSeconds = 600) => {
    const key = cacheHelpers.keys.chat(chatId);
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  },

  // Get cached chat
  getChat: async (chatId: string) => {
    const key = cacheHelpers.keys.chat(chatId);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  },

  // Invalidate all cache entries for an owner
  invalidateOwnerCache: async (ownerId: string) => {
    const patterns = [
      `chat:list:${ownerId}:*`,
      `owner:${ownerId}:*`
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  },

  // Invalidate specific chat cache
  invalidateChat: async (chatId: string) => {
    const key = cacheHelpers.keys.chat(chatId);
    await redis.del(key);
  },

  // Cache owner settings
  setOwnerSettings: async (ownerId: string, data: any, ttlSeconds = 300) => {
    const key = cacheHelpers.keys.ownerSettings(ownerId);
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  },

  // Get cached owner settings
  getOwnerSettings: async (ownerId: string) => {
    const key = cacheHelpers.keys.ownerSettings(ownerId);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  },

  // Invalidate owner settings cache
  invalidateOwnerSettings: async (ownerId: string) => {
    const key = cacheHelpers.keys.ownerSettings(ownerId);
    await redis.del(key);
  },

  // Clear all cache (use with caution)
  clearAll: async () => {
    await redis.flushall();
  },

  // Streaming functions
  streaming: {
    // Start a new stream session
    startStream: async (chatId: string, messageId: string, initialData: any) => {
      const streamKey = cacheHelpers.keys.activeStream(chatId);
      const streamData = {
        messageId,
        startedAt: new Date().toISOString(),
        content: '',
        status: 'streaming',
        ...initialData
      };
      
      // Set active stream with 30 minute expiration
      await redis.setex(streamKey, 1800, JSON.stringify(streamData));
      
      return streamData;
    },

    // Append content to stream
    appendToStream: async (chatId: string, content: string) => {
      const streamKey = cacheHelpers.keys.activeStream(chatId);
      const currentData = await redis.get(streamKey);
      
      if (currentData) {
        const streamData = JSON.parse(currentData);
        streamData.content += content;
        streamData.updatedAt = new Date().toISOString();
        
        // Update stream data
        await redis.setex(streamKey, 1800, JSON.stringify(streamData));
        
        // Publish to subscribers (only send delta content, not full content)
        const channel = cacheHelpers.keys.streamChannel(chatId);
        await redisPubSub.publish(channel, JSON.stringify({
          type: 'chunk',
          chatId,
          content, // Only the delta content
          timestamp: streamData.updatedAt
        }));
        
        return streamData;
      }
      
      return null;
    },

    // End stream and save final content
    endStream: async (chatId: string, finalMessage?: any) => {
      const streamKey = cacheHelpers.keys.activeStream(chatId);
      const currentData = await redis.get(streamKey);
      
      if (currentData) {
        const streamData = JSON.parse(currentData);
        streamData.status = 'completed';
        streamData.completedAt = new Date().toISOString();
        
        // Publish completion event (send final full content)
        const channel = cacheHelpers.keys.streamChannel(chatId);
        await redisPubSub.publish(channel, JSON.stringify({
          type: 'complete',
          chatId,
          fullContent: streamData.content, // Send full content on completion
          message: finalMessage,
          timestamp: streamData.completedAt
        }));
        
        // Remove active stream
        await redis.del(streamKey);
        
        // Invalidate chat cache to refresh with new message
        await cacheHelpers.invalidateChat(chatId);
        
        return streamData;
      }
      
      return null;
    },

    // Get current stream data
    getActiveStream: async (chatId: string) => {
      const streamKey = cacheHelpers.keys.activeStream(chatId);
      const data = await redis.get(streamKey);
      return data ? JSON.parse(data) : null;
    },

    // Subscribe to stream updates
    subscribeToStream: (chatId: string, callback: (data: any) => void) => {
      const channel = cacheHelpers.keys.streamChannel(chatId);
      const subscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      });
      
      subscriber.subscribe(channel);
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const data = JSON.parse(message);
            callback(data);
          } catch (error) {
            console.error('Error parsing stream message:', error);
          }
        }
      });
      
      return subscriber;
    },

    // Publish stream error
    publishError: async (chatId: string, error: string) => {
      const channel = cacheHelpers.keys.streamChannel(chatId);
      await redisPubSub.publish(channel, JSON.stringify({
        type: 'error',
        chatId,
        error,
        timestamp: new Date().toISOString()
      }));
    }
  }
};

export { redisPubSub };
export default redis; 