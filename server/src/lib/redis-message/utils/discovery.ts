/**
 * Discovery Utilities
 * 
 * Helper functions for discovering active streams and getting stream information
 */

import { redisUtil, redisWriter } from '../clients';
import type { ActiveStreamInfo } from '../types';

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;

// Helper to discover active chat streams using non-blocking SCAN
export const discoverActiveChatStreams = async (): Promise<string[]> => {
  const pattern = 'message-stream-*:stream';
  const chatIds: string[] = [];

  try {
    let cursor = '0';
    do {
      // SCAN cursor MATCH pattern COUNT 100
      const [nextCursor, keys] = await redisUtil.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = nextCursor;

      chatIds.push(
        ...keys
          .map(key => key.replace('message-stream-', '').replace(':stream', ''))
          .filter(id => id.length > 0)
      );
    } while (cursor !== '0');

    return chatIds;
  } catch (error) {
    console.error('❌ Error discovering active chat streams:', error);
    return [];
  }
};

/**
 * Get active message chunk streams
 */
export async function getActiveMessageChunkStreams(): Promise<ActiveStreamInfo[]> {
  try {
    const result: ActiveStreamInfo[] = [];

    // Check all active chat streams
    const chatIds = await discoverActiveChatStreams();
    for (const chatId of chatIds) {
      const streamKey = `${getStreamName(chatId)}:stream`;

      // Check key type first to handle transition from sorted sets
      const keyType = await redisUtil.type(streamKey);

      if (keyType === 'zset') {
        // Old sorted set key - migrate to stream
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
          // If migration fails, skip this stream
          continue;
        }
      } else if (keyType === 'none') {
        // Key doesn't exist, skip
        continue;
      } else if (keyType !== 'stream') {
        // Key exists but wrong type and not a sorted set
        console.log(`⚠️ Key ${streamKey} has unexpected type: ${keyType}, deleting...`);
        await redisUtil.del(streamKey);
        continue;
      }

      // Now we can safely use stream operations
      const streamLength = await redisUtil.xlen(streamKey);
      if (streamLength > 0) {
        result.push({ streamId: chatId, chatId, jobId: streamKey });
      }
    }

    return result;
  } catch (error) {
    console.error(`❌ Error getting active message chunk streams:`, error);
    return [];
  }
} 