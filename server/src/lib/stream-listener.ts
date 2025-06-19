/**
 * Stream Listener Utility
 * 
 * Provides a clean async iterable interface for Redis event-sourced streams.
 * Handles race conditions, message queuing, and cleanup automatically.
 */

import Redis from 'ioredis';
import { streamHelpers } from './redis.event-sourcing.js';

export interface StreamEvent {
  type: "start" | "chunk" | "complete" | "error";
  streamId: string;
  data?: object;
  timestamp: string;
  error?: string;
  eventId?: string;
}

export interface StreamListenerOptions {
  streamId: string;
  fromEventId?: string;
  timeoutMs?: number;
}

/**
 * Creates an async iterable for Redis event-sourced streams
 * 
 * Features:
 * - Race condition safe (subscribes before yielding past events)
 * - Zero message loss (queues events during past event iteration)
 * - Automatic cleanup on completion/error
 * - Resume capability with fromEventId
 * 
 * @param options Stream listener configuration
 * @returns AsyncIterable that yields stream events
 */
export async function* createStreamListener(
  options: StreamListenerOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const { streamId, fromEventId = '0', timeoutMs = 30000 } = options;

  // Check if stream exists and is not completed
  const streamMeta = await streamHelpers.getStreamMeta(streamId);
  if (!streamMeta) {
    console.log(`Stream ${streamId} not found, nothing to listen to`);
    return;
  }

  if (streamMeta.status === 'completed') {
    console.log(`Stream ${streamId} is already completed, nothing to listen to`);
    return;
  }

  // Create Redis subscriber
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  try {
    // STEP 1: Subscribe FIRST to prevent race condition
    const channel = streamHelpers.keys.streamChannel(streamId);
    await subscriber.subscribe(channel);

    const messageQueue: StreamEvent[] = [];
    let messageResolver: ((value: StreamEvent | null) => void) | null = null;

    // Set up message handler
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel !== channel) return;
      
      try {
        const event = JSON.parse(message) as StreamEvent;
        if (event.streamId === streamId) {
          if (messageResolver) {
            messageResolver(event);
            messageResolver = null;
          } else {
            messageQueue.push(event);
          }
        }
      } catch (error) {
        console.error("Error parsing stream event:", error);
      }
    });

    // STEP 2: Get and yield past events (new events are queued meanwhile)
    console.log(`Getting past events for stream ${streamId} from ${fromEventId}`);
    const pastEvents = await streamHelpers.getStreamEvents(streamId, fromEventId);
    console.log(`Found ${pastEvents.length} past events`);

    for (const event of pastEvents) {
      if (event.type === 'complete') {
        console.log(`Found complete event in past events, stream ${streamId} is done`);
        return;
      }
      
      if (event.type === 'start') {
        yield {
          type: "start",
          streamId,
          timestamp: event.timestamp,
        };
      } else if (event.type === 'chunk') {
        yield {
          type: "chunk",
          streamId,
          data: { content: event.content },
          timestamp: event.timestamp,
          eventId: event.id,
        };
      }
    }

    // STEP 3: Stream real-time events (including queued ones)
    let streaming = true;
    while (streaming) {
      const data = await new Promise<StreamEvent | null>((resolve) => {
        // Check if we have queued messages first
        if (messageQueue.length > 0) {
          resolve(messageQueue.shift()!);
          return;
        }

        // Wait for new message
        messageResolver = resolve;
        
        // Timeout check
        setTimeout(async () => {
          if (messageResolver === resolve) {
            const streamMeta = await streamHelpers.getStreamMeta(streamId);
            if (!streamMeta) {
              resolve(null); // Stream expired
            }
            messageResolver = null;
          }
        }, timeoutMs);
      });

      if (data === null) {
        streaming = false;
        continue;
      }

      // Stop on completion/error without yielding
      if (data.type === "complete") {
        console.log(`Stream ${streamId} completed during listening, stopping`);
        streaming = false;
        continue;
      }

      if (data.type === "error") {
        console.log(`Stream ${streamId} errored during listening, stopping`);
        streaming = false;
        continue;
      }

      // Yield ongoing events (start/chunk)
      yield data;
    }

  } finally {
    // Cleanup
    await subscriber.unsubscribe();
    subscriber.disconnect();
  }
}

/**
 * Convenience function for simple stream listening
 */
export function listenToStream(streamId: string, fromEventId?: string) {
  return createStreamListener({ streamId, fromEventId });
} 