/**
 * Cleanup Utilities
 * 
 * Helper functions for cleaning up inactive streams and managing stream lifecycle
 */

import { redisUtil } from '../clients';
import { discoverActiveChatStreams } from './discovery';

// Helper to get stream name for a chat
const getStreamName = (chatId: string): string => `message-stream-${chatId}`;

/**
 * Clean up inactive message chunk streams for a specific chat
 */
export async function cleanupInactiveMessageChunkStreams(chatId: string): Promise<boolean> {
  try {
    const streamKey = `${getStreamName(chatId)}:stream`;

    // Delete the stream
    const result = await redisUtil.del(streamKey);

    console.log(`🧹 Cleaned up stream for chat ${chatId}: ${result} keys deleted`);
    return result > 0;
  } catch (error) {
    console.error(`❌ Error cleaning up message chunk streams for ${chatId}:`, error);
    return false;
  }
}

/**
 * Clean up all inactive message chunk streams
 */
export async function cleanupAllInactiveMessageChunkStreams(): Promise<number> {
  try {
    const chatIds = await discoverActiveChatStreams();
    let totalCleaned = 0;

    for (const chatId of chatIds) {
      const cleaned = await cleanupInactiveMessageChunkStreams(chatId);
      if (cleaned) totalCleaned++;
    }

    console.log(`🧹 Cleaned up ${totalCleaned} inactive message chunk streams`);
    return totalCleaned;
  } catch (error) {
    console.error(`❌ Error cleaning up all inactive message chunk streams:`, error);
    return 0;
  }
}

/**
 * Stop a message chunk stream by setting a stop flag
 */
export async function stopMessageChunkStream(chatId: string): Promise<boolean> {
  try {
    await redisUtil.set(`stop-stream:${chatId}`, '1', 'EX', 60 * 5); // auto-expire in 5 minutes
    console.log(`🛑 Stop flag set for chat: ${chatId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error stopping message chunk stream ${chatId}:`, error);
    return false;
  }
} 