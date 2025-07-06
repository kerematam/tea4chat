/**
 * Metrics Utilities
 * 
 * Helper functions for getting stream metrics and monitoring stream performance
 */

import { redisUtil, redisWriter } from '../clients';
import type { StreamMetrics } from '../types';
import { discoverActiveChatStreams } from './discovery';

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;

/**
 * Get message chunk stream metrics for a specific chat
 */
export async function getMessageChunkStreamMetrics(chatId: string): Promise<StreamMetrics | null> {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;

    // Check key type first to handle transition from sorted sets
    const keyType = await redisUtil.type(streamKey);

    if (keyType === 'zset') {
      // Old sorted set key - migrate to stream or skip
      console.log(`⚠️ Found old sorted set key for chat ${chatId}, migrating to stream...`);

      try {
        // Get all events from sorted set
        const events = await redisUtil.zrange(streamKey, 0, -1);

        // Delete the old sorted set
        await redisUtil.del(streamKey);

        // Add events to new stream
        if (events.length > 0) {
          const pipeline = redisWriter.pipeline();
          events.forEach(eventStr => {
            pipeline.xadd(streamKey, '*', 'event', eventStr);
          });
          await pipeline.exec();

          console.log(`✅ Migrated ${events.length} events from sorted set to stream for chat ${chatId}`);
        }
      } catch (migrationError) {
        console.error(`❌ Error migrating sorted set for chat ${chatId}:`, migrationError);
        // If migration fails, just delete the old key
        await redisUtil.del(streamKey);
        return null;
      }
    } else if (keyType === 'none') {
      // Key doesn't exist
      return null;
    } else if (keyType !== 'stream') {
      // Key exists but wrong type and not a sorted set
      console.log(`⚠️ Key ${streamKey} has unexpected type: ${keyType}, deleting...`);
      await redisUtil.del(streamKey);
      return null;
    }

    // Now we can safely use stream operations
    const streamLength = await redisUtil.xlen(streamKey);

    let firstId = null;
    let lastId = null;
    let oldestTimestamp = null;
    let newestTimestamp = null;

    if (streamLength > 0) {
      // Get first and last message IDs
      const firstMessages = await redisUtil.xrange(streamKey, '-', '+', 'COUNT', '1');
      const lastMessages = await redisUtil.xrevrange(streamKey, '+', '-', 'COUNT', '1');

      if (firstMessages.length > 0 && firstMessages[0]) {
        firstId = firstMessages[0][0];
        // Extract timestamp from stream ID (format: timestamp-sequence)
        const timestampPart = firstId.split('-')[0];
        if (timestampPart) {
          oldestTimestamp = parseInt(timestampPart);
        }
      }

      if (lastMessages.length > 0 && lastMessages[0]) {
        lastId = lastMessages[0][0];
        const timestampPart = lastId.split('-')[0];
        if (timestampPart) {
          newestTimestamp = parseInt(timestampPart);
        }
      }
    }

    return {
      chatId,
      streamKey,
      totalMessages: streamLength,
      firstMessageId: firstId,
      lastMessageId: lastId,
      oldestTimestamp,
      newestTimestamp,
      ageSeconds: newestTimestamp && oldestTimestamp ? (newestTimestamp - oldestTimestamp) / 1000 : 0
    };
  } catch (error) {
    console.error(`❌ Error getting message chunk stream metrics for ${chatId}:`, error);
    return null;
  }
}

/**
 * Get metrics for all active message chunk streams
 */
export async function getAllMessageChunkStreamMetrics(): Promise<StreamMetrics[]> {
  try {
    const chatIds = await discoverActiveChatStreams();
    const metrics = await Promise.all(
      chatIds.map(chatId => getMessageChunkStreamMetrics(chatId))
    );

    return metrics.filter(m => m !== null) as StreamMetrics[];
  } catch (error) {
    console.error(`❌ Error getting all message chunk stream metrics:`, error);
    return [];
  }
} 