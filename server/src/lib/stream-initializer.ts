/**
 * Stream Initialization Utility
 * 
 * Handles the complex logic of initializing streams with proper cleanup
 * and validation of existing streams.
 */

import { TRPCError } from "@trpc/server";
import { streamHelpers } from "./redis.event-sourcing.js";

/**
 * Creates a StreamController with methods bound to a specific stream ID
 */
function createStreamController(streamId: string, initResult: StreamInitializationResult): StreamController {
  return {
    streamId,
    addChunk: (content: string) => streamHelpers.addChunk(streamId, content),
    complete: (metadata?: object) => streamHelpers.completeStream(streamId, metadata),
    getMeta: () => streamHelpers.getStreamMeta(streamId),
    getEvents: (fromId?: string) => streamHelpers.getStreamEvents(streamId, fromId),
    initializationResult: initResult,
  };
}

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

export interface StreamController {
  streamId: string;
  addChunk: (content: string) => Promise<{ eventId: string | null; timestamp: string; } | null>;
  complete: (metadata?: object) => Promise<{ timestamp: string; }>;
  getMeta: () => Promise<any>;
  getEvents: (fromId?: string) => Promise<any[]>;
  initializationResult: StreamInitializationResult;
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
 * @returns StreamController with methods bound to the specific stream
 * @throws TRPCError if stream cannot be initialized
 */
export async function initializeStream(
  options: StreamInitializationOptions
): Promise<StreamController> {
  const { streamId, streamConfig, staleTimeoutSeconds } = options;

  // Check if stream exists in Redis
  const existingMeta = await streamHelpers.getStreamMeta(streamId);
  
  if (!existingMeta) {
    // No existing stream, create new one
    await streamHelpers.createStream(streamId, streamConfig);
    const initResult = {
      wasRecreated: false,
      cleanupPerformed: false,
      reason: 'new' as const
    };
    return createStreamController(streamId, initResult);
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
    const initResult = {
      wasRecreated: true,
      cleanupPerformed,
      reason: 'completed-cleanup' as const
    };
    return createStreamController(streamId, initResult);
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
  const initResult = {
    wasRecreated: true,
    cleanupPerformed: false,
    reason: 'timeout-recreation' as const
  };
  return createStreamController(streamId, initResult);
}

 