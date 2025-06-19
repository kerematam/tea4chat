/**
 * Stream Initialization Utility
 * 
 * Handles the complex logic of initializing streams with proper cleanup
 * and validation of existing streams.
 */

import { TRPCError } from "@trpc/server";
import { streamHelpers } from "./redis.event-sourcing.js";

export interface StreamInitializationOptions {
  streamId: string;
  streamConfig: {
    type: string;
    intervalMs: number;
    ownerId?: string;
  };
  staleTimeoutSeconds: number;
}

export interface StreamInitializationResult {
  wasRecreated: boolean;
  cleanupPerformed: boolean;
  reason: 'new' | 'completed-cleanup' | 'timeout-recreation';
}

/**
 * Initialize a stream with smart recreation logic
 * 
 * Handles:
 * - Checking if stream already exists
 * - Cleaning up completed streams before recreation
 * - Validating timeout for incomplete streams
 * - Creating new stream with proper configuration
 * 
 * @param options Stream initialization configuration
 * @returns Information about the initialization process
 * @throws TRPCError if stream cannot be initialized
 */
export async function initializeStream(
  options: StreamInitializationOptions
): Promise<StreamInitializationResult> {
  const { streamId, streamConfig, staleTimeoutSeconds } = options;

  // Check if stream exists in Redis
  const existingMeta = await streamHelpers.getStreamMeta(streamId);
  
  if (!existingMeta) {
    // No existing stream, create new one
    await streamHelpers.createStream(streamId, streamConfig);
    return {
      wasRecreated: false,
      cleanupPerformed: false,
      reason: 'new'
    };
  }

  // Stream exists, check completion status
  const events = await streamHelpers.getStreamEvents(streamId);
  const lastEvent = events[events.length - 1];
  
  if (lastEvent?.type === 'complete') {
    // Stream is complete, clean up previous events before recreation
    console.log(`Stream ${streamId} is complete, cleaning up previous events before recreation`);
    
    let cleanupPerformed = false;
    try {
      await streamHelpers.cleanup.deleteStream(streamId);
      console.log(`Cleaned up completed stream ${streamId} before recreation`);
      cleanupPerformed = true;
    } catch (error) {
      console.error(`Error cleaning up completed stream ${streamId}:`, error);
      // Continue with recreation even if cleanup fails
    }

    // Create new stream after cleanup
    await streamHelpers.createStream(streamId, streamConfig);
    return {
      wasRecreated: true,
      cleanupPerformed,
      reason: 'completed-cleanup'
    };
  }

  // Stream is not complete, check timeout
  const lastActivity = existingMeta.lastActivity || existingMeta.startedAt;
  const timeSinceLastActivity = Date.now() - new Date(lastActivity).getTime();
  const timeoutMs = staleTimeoutSeconds * 1000;
  
  if (timeSinceLastActivity < timeoutMs) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Stream exists and is not complete. Wait ${Math.ceil((timeoutMs - timeSinceLastActivity) / 1000)}s or until completion.`,
    });
  }

  // Stream timed out, allow recreation
  console.log(`Stream ${streamId} timed out (${Math.round(timeSinceLastActivity / 1000)}s > ${staleTimeoutSeconds}s), allowing recreation`);
  
  // Create new stream (old one will be cleaned up by TTL)
  await streamHelpers.createStream(streamId, streamConfig);
  return {
    wasRecreated: true,
    cleanupPerformed: false,
    reason: 'timeout-recreation'
  };
}

 