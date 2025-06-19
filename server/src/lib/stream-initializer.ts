/**
 * Stream Initialization Utility
 * 
 * This module provides a high-level, type-safe interface for managing Redis-based
 * event-sourced streams. It handles complex initialization logic, provides automatic
 * cleanup, and offers a clean controller-based API.
 * 
 * ## Key Features:
 * - **Type Safety**: Full TypeScript generics support for stream data
 * - **Smart Initialization**: Handles existing streams, timeouts, and cleanup
 * - **Self-Contained**: Controller manages its own lifecycle and cleanup
 * - **Flexible**: Works with any data structure via generics
 * 
 * ## Basic Usage:
 * ```typescript
 * interface MyData {
 *   content: string;
 *   userId: string;
 * }
 * 
 * const controller = await initializeStream<MyData>({
 *   streamId: 'my-stream',
 *   streamConfig: { type: 'demo', intervalMs: 1000 },
 *   staleTimeoutSeconds: 30
 * });
 * 
 * await controller.push({ content: 'Hello', userId: 'user-123' });
 * await controller.stop('finished');
 * ```
 * 
 * ## Documentation:
 * For comprehensive documentation, examples, and best practices, see:
 * - docs/stream-controller.md - Complete API reference and usage guide
 * - docs/event-sourcing-streams.md - Lower-level implementation details
 * 
 * @see {@link https://github.com/your-repo/docs/stream-controller.md}
 */

import { TRPCError } from "@trpc/server";
import { streamHelpers } from "./redis.event-sourcing.js";

/**
 * Creates a StreamController with methods bound to a specific stream ID
 */
function createStreamController<T = any>(
  streamId: string, 
  initResult: StreamInitializationResult,
  activeStreamsMap?: Map<string, NodeJS.Timeout>,
  activeControllersMap?: Map<string, any>
): StreamController<T> {
  // Built-in cleanup function
  const cleanup = () => {
    if (activeStreamsMap?.has(streamId)) {
      const interval = activeStreamsMap.get(streamId);
      if (interval) {
        clearInterval(interval);
        activeStreamsMap.delete(streamId);
        console.log(`Cleared interval for stream ${streamId}`);
      }
    }
    
    if (activeControllersMap?.has(streamId)) {
      activeControllersMap.delete(streamId);
      console.log(`Removed controller for stream ${streamId}`);
    }
  };

  return {
    streamId,
    push: (data: T) => {
      // Pass the entire data object to Redis for storage
      return streamHelpers.addChunk(streamId, data);
    },
    complete: async (metadata?: object) => {
      // Always cleanup when completing
      cleanup();
      return await streamHelpers.completeStream(streamId, metadata);
    },
    terminate: async (reason?: string) => {
      // Always cleanup when terminating
      cleanup();
      
      // Complete the stream with termination reason
      return await streamHelpers.completeStream(streamId, { reason: reason || 'terminated' });
    },
    getMeta: async () => {
      const meta = await streamHelpers.getStreamMeta(streamId);
      
      // If stream expired, trigger built-in cleanup
      if (!meta) {
        console.log(`Stream ${streamId} expired, triggering cleanup`);
        cleanup();
      }
      
      return meta;
    },
    getEvents: (fromId?: string) => streamHelpers.getStreamEvents(streamId, fromId),
    initializationResult: initResult,
    cleanup,
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
  activeStreamsMap?: Map<string, NodeJS.Timeout>;
  activeControllersMap?: Map<string, any>;
}

export interface StreamInitializationResult {
  wasRecreated: boolean;
  cleanupPerformed: boolean;
  reason: 'new' | 'completed-cleanup' | 'timeout-recreation';
}





export interface StreamController<T = any> {
  streamId: string;
  push: (data: T) => Promise<{ eventId: string | null; timestamp: string; } | null>;
  complete: (metadata?: object) => Promise<{ timestamp: string; }>;
  terminate: (reason?: string) => Promise<{ timestamp: string; }>;
  getMeta: () => Promise<any>;
  getEvents: (fromId?: string) => Promise<any[]>;
  initializationResult: StreamInitializationResult;
  cleanup: () => void;
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
export async function initializeStream<T = any>(
  options: StreamInitializationOptions
): Promise<StreamController<T>> {
  const { streamId, streamConfig, staleTimeoutSeconds, activeStreamsMap, activeControllersMap } = options;

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
    return createStreamController<T>(streamId, initResult, activeStreamsMap, activeControllersMap);
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
    return createStreamController<T>(streamId, initResult, activeStreamsMap, activeControllersMap);
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
  return createStreamController<T>(streamId, initResult);
}

 