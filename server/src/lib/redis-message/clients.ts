/**
 * Redis Clients for Message Streaming
 * 
 * Separate clients for optimal performance:
 * - Writer: Dedicated for XADD operations (fast, non-blocking)
 * - Reader: Dedicated for XREAD operations (can block without affecting writes)
 * - Utility: For general operations like SCAN, TYPE, DEL
 */

import { redis } from '../redis';

// Create separate Redis clients for optimal performance
// Writer client - dedicated for XADD operations (fast, non-blocking)
export const redisWriter = redis.duplicate();

// Reader client - dedicated for XREAD operations (can block without affecting writes)
export const redisReader = redis.duplicate();

// Utility client - for general operations like SCAN, TYPE, DEL
export const redisUtil = redis.duplicate();

// Handle Redis connection events for writer client
redisWriter.on('connect', () => {
  console.log('Redis Writer client connected successfully');
});

redisWriter.on('error', (error) => {
  console.error('Redis Writer client connection error:', error);
});

// Handle Redis connection events for reader client
redisReader.on('connect', () => {
  console.log('Redis Reader client connected successfully');
});

redisReader.on('error', (error) => {
  console.error('Redis Reader client connection error:', error);
});

// Handle Redis connection events for utility client
redisUtil.on('connect', () => {
  console.log('Redis Utility client connected successfully');
});

redisUtil.on('error', (error) => {
  console.error('Redis Utility client connection error:', error);
});

// Keep original for backwards compatibility (will be deprecated)
redis.on('connect', () => {
  console.log('Redis Message Streaming connected successfully');
});

redis.on('error', (error) => {
  console.error('Redis Message Streaming connection error:', error);
});

// Cleanup function for graceful shutdown
export const cleanup = async () => {
  console.log('🧹 Cleaning up Redis message streaming resources...');

  // Close all Redis connections
  await Promise.all([
    redisWriter.quit(),
    redisReader.quit(),
    redisUtil.quit(),
    redis.quit()
  ]);

  console.log('🧹 All Redis connections closed');
};

// Setup process exit handlers
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup); 