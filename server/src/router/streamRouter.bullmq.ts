import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
    getQueueMetrics,
    streamEventEmitter,
    streamManager,
    type StreamEventData,
    type StreamJobData
} from "../lib/bullmq-streams";
import { withOwnerProcedure } from "../procedures";
import { router } from "../trpc";

// Types for stream events (compatible with UI)
export type StreamChunk = {
    type: "start" | "chunk" | "complete" | "error";
    streamId: string;
    data?: { content?: string;[key: string]: any };
    timestamp: string;
    error?: string;
    jobId?: string;
    progress?: {
        current: number;
        total?: number;
        percentage?: number;
    };
};

export const streamRouterBullMQ = router({
    // Create or stop a stream using BullMQ
    manageStream: withOwnerProcedure
        .input(
            z.object({
                streamId: z.string(),
                action: z.enum(["start", "stop"]),
                intervalMs: z.number().min(10).max(5000).default(1000),
                streamType: z.enum(["demo", "ai", "custom"]).default("demo"),
                maxChunks: z.number().min(1).max(1000).default(100),
                config: z.record(z.any()).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const { streamId, action, intervalMs, streamType, maxChunks, config } = input;

            if (action === "start") {
                try {
                    // Prepare job data
                    const jobData: StreamJobData = {
                        streamId,
                        type: streamType,
                        intervalMs,
                        maxChunks,
                        ownerId: ctx.owner?.id,
                        config,
                    };

                    // Start the stream job
                    const result = await streamManager.startStream(jobData);

                    console.log(`✅ BullMQ stream started: ${streamId} (Job: ${result.jobId})`);

                    return {
                        success: true,
                        message: "Stream started",
                        streamId,
                        jobId: result.jobId,
                        type: streamType,
                    };

                } catch (error: any) {
                    console.error(`❌ Failed to start stream ${streamId}:`, error);

                    if (error.message.includes('already active')) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message: error.message,
                        });
                    }

                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: `Failed to start stream: ${error.message}`,
                    });
                }

            } else if (action === "stop") {
                try {
                    const success = await streamManager.stopStream(streamId);

                    if (!success) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: "Stream not found or already stopped",
                        });
                    }

                    console.log(`🛑 BullMQ stream stopped: ${streamId}`);

                    return {
                        success: true,
                        message: "Stream stopped",
                        streamId,
                    };

                } catch (error: any) {
                    console.error(`❌ Failed to stop stream ${streamId}:`, error);

                    if (error.message.includes('not found')) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: error.message,
                        });
                    }

                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: `Failed to stop stream: ${error.message}`,
                    });
                }
            }

            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid action"
            });
        }),

    // Listen to a stream using BullMQ event emitter with replay support
    listenToStream: withOwnerProcedure
        .input(z.object({
            streamId: z.string(),
            fromEventId: z.string().optional() // Kept for API compatibility, but not used in BullMQ
        }))
        .mutation(async function* ({ input }) {
            const { streamId } = input;

            console.log(`🎧 Starting to listen to BullMQ stream with replay: ${streamId}`);

            let eventBuffer: StreamChunk[] = [];
            let isComplete = false;
            let unsubscribe: (() => void) | null = null;

            try {
                // Subscribe to stream events WITH REPLAY SUPPORT
                unsubscribe = await streamEventEmitter.subscribeWithReplay(streamId, (event: StreamEventData) => {
                    console.log(`📨 Received event for ${streamId}:`, event.type);

                    // Convert BullMQ event to UI-compatible format
                    const streamChunk: StreamChunk = {
                        type: event.type,
                        streamId: event.streamId,
                        timestamp: event.timestamp,
                        jobId: event.jobId,
                        progress: event.progress,
                    };

                    // Add data based on event type
                    if (event.type === 'chunk' && event.data) {
                        streamChunk.data = {
                            content: event.data.content,
                            chunkNumber: event.data.chunkNumber,
                            metadata: event.data.metadata,
                        };
                    } else if (event.type === 'complete' && event.data) {
                        streamChunk.data = event.data;
                    } else if (event.type === 'error') {
                        streamChunk.error = event.error;
                    }

                    eventBuffer.push(streamChunk);

                    // Mark as complete for cleanup
                    if (event.type === 'complete' || event.type === 'error') {
                        isComplete = true;
                    }
                });

                // Check if stream is already active and get its current status
                const streamStatus = await streamManager.getStreamStatus(streamId);
                if (streamStatus) {
                    console.log(`📊 Stream ${streamId} status:`, streamStatus.state);

                    // If stream is already completed, we might not get events
                    if (streamStatus.state === 'completed' || streamStatus.state === 'failed') {
                        const finalEvent: StreamChunk = {
                            type: streamStatus.state === 'completed' ? 'complete' : 'error',
                            streamId,
                            timestamp: new Date().toISOString(),
                            jobId: streamStatus.jobId,
                            error: streamStatus.state === 'failed' ? 'Stream job failed' : undefined,
                        };
                        eventBuffer.push(finalEvent);
                        isComplete = true;
                    }
                }

                // Yield events as they arrive
                let lastYieldedIndex = 0;
                const timeout = setTimeout(() => {
                    isComplete = true;
                }, 30000); // 30 second timeout

                while (!isComplete || lastYieldedIndex < eventBuffer.length) {
                    // Yield any new events
                    while (lastYieldedIndex < eventBuffer.length) {
                        const event = eventBuffer[lastYieldedIndex];
                        if (event) {
                            console.log(`📤 Yielding event ${lastYieldedIndex + 1}/${eventBuffer.length}:`, event.type);
                            yield event;
                        }
                        lastYieldedIndex++;
                    }

                    // If complete, break the loop
                    if (isComplete && lastYieldedIndex >= eventBuffer.length) {
                        break;
                    }

                    // Wait a bit before checking for new events
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                clearTimeout(timeout);
                console.log(`✅ Stream listening completed for ${streamId}, yielded ${lastYieldedIndex} events`);

            } catch (error) {
                console.error(`❌ Stream listening error for ${streamId}:`, error);

                // Yield error event
                yield {
                    type: 'error',
                    streamId,
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : 'Unknown error',
                } as StreamChunk;

            } finally {
                // Clean up subscription
                if (unsubscribe) {
                    unsubscribe();
                }
            }
        }),

    // Get stream status and information
    getStreamStatus: withOwnerProcedure
        .input(z.object({ streamId: z.string() }))
        .query(async ({ input }) => {
            const { streamId } = input;

            try {
                const status = await streamManager.getStreamStatus(streamId);

                if (!status) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Stream not found"
                    });
                }

                return {
                    streamId: status.streamId,
                    jobId: status.jobId,
                    state: status.state,
                    progress: status.progress,
                    data: status.data,
                    processedOn: status.processedOn,
                    finishedOn: status.finishedOn,
                    createdAt: status.createdAt,
                };

            } catch (error: any) {
                if (error instanceof TRPCError) {
                    throw error;
                }

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to get stream status: ${error.message}`,
                });
            }
        }),

    // Get all active streams
    getActiveStreams: withOwnerProcedure
        .query(async () => {
            try {
                const activeStreams = streamManager.getActiveStreams();
                const queueMetrics = await getQueueMetrics();

                return {
                    activeStreams,
                    queueMetrics,
                    note: "Using BullMQ job queues for distributed stream processing!"
                };

            } catch (error: any) {
                console.error('Failed to get active streams:', error);
                return {
                    activeStreams: [],
                    queueMetrics: null,
                    note: "Error retrieving stream information"
                };
            }
        }),

    // Generate stream ID
    generateStreamId: withOwnerProcedure
        .query(() => {
            const streamId = streamManager.generateStreamId();
            return { streamId };
        }),

    // Get queue metrics for monitoring
    getQueueMetrics: withOwnerProcedure
        .query(async () => {
            try {
                const metrics = await getQueueMetrics();
                return metrics;
            } catch (error: any) {
                console.error('Failed to get queue metrics:', error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to get queue metrics: ${error.message}`,
                });
            }
        }),

    // Cleanup completed streams
    cleanup: withOwnerProcedure
        .mutation(async () => {
            try {
                await streamManager.cleanup();
                return { success: true, message: "Cleanup completed" };
            } catch (error: any) {
                console.error('Failed to cleanup streams:', error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to cleanup: ${error.message}`,
                });
            }
        }),

    // Get stored events for a stream (for debugging replay functionality)
    getStoredEvents: withOwnerProcedure
        .input(z.object({ streamId: z.string() }))
        .query(async ({ input }) => {
            const { streamId } = input;
            
            try {
                // Import the store from the lib
                const { streamEventStore } = await import("../lib/bullmq-streams");
                
                const events = await streamEventStore.getStoredEvents(streamId);
                const eventCount = await streamEventStore.getEventCount(streamId);
                
                return {
                    streamId,
                    events,
                    eventCount,
                    hasEvents: events.length > 0,
                };
                
            } catch (error: any) {
                console.error('Failed to get stored events:', error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to get stored events: ${error.message}`,
                });
            }
        }),

    // Clear stored events for a stream (for testing)
    clearStoredEvents: withOwnerProcedure
        .input(z.object({ streamId: z.string() }))
        .mutation(async ({ input }) => {
            const { streamId } = input;
            
            try {
                // Import the store from the lib
                const { streamEventStore } = await import("../lib/bullmq-streams");
                
                await streamEventStore.clearEvents(streamId);
                
                return {
                    success: true,
                    message: `Cleared stored events for stream ${streamId}`,
                    streamId,
                };
                
            } catch (error: any) {
                console.error('Failed to clear stored events:', error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to clear stored events: ${error.message}`,
                });
            }
        }),
}); 