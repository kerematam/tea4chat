/**
 * Redis Message Streaming Module
 * 
 * A comprehensive Redis Streams-based message streaming system with:
 * - Batching and throttling for optimal performance
 * - Separate Redis clients for read/write operations
 * - Stream discovery, metrics, and cleanup utilities
 * - Type-safe interfaces and clean abstractions
 */

// Export all types
export type {
    ActiveStreamInfo, BatchedQueue, BatchedQueueOptions, MessageChunkStreamData, MessageType,
    StreamMessage, StreamMetrics, StreamQueue, StreamQueueOptions
} from './types';

// Export main streaming operations
export {
    startMessageChunkStream,
    subscribeToMessageChunkStream
} from './message-streaming';

// Export stream queue abstractions
export {
    createBatchedQueue,
    createStreamQueue
} from './stream-queue';

// Export utility functions
export {
    discoverActiveChatStreams,
    getActiveMessageChunkStreams
} from './utils/discovery';

export {
    getAllMessageChunkStreamMetrics, getMessageChunkStreamMetrics
} from './utils/metrics';

export {
    cleanupAllInactiveMessageChunkStreams, cleanupInactiveMessageChunkStreams, stopMessageChunkStream
} from './utils/cleanup';

export {
    generateContent,
    splitIntoChunks
} from './utils/content-generation';

// Export Redis clients (if needed for advanced usage)
export {
    cleanup, redisReader,
    redisUtil, redisWriter
} from './clients';

// Re-export the old interface for backwards compatibility
// This allows existing code to work without changes
export {
    startMessageChunkStream as startMessageChunkStreamLegacy,
    subscribeToMessageChunkStream as subscribeToMessageChunkStreamLegacy
} from './message-streaming';

export {
    getActiveMessageChunkStreams as getActiveMessageChunkStreamsLegacy
} from './utils/discovery';

export {
    getAllMessageChunkStreamMetrics as getAllMessageChunkStreamMetricsLegacy, getMessageChunkStreamMetrics as getMessageChunkStreamMetricsLegacy
} from './utils/metrics';

export {
    cleanupAllInactiveMessageChunkStreams as cleanupAllInactiveMessageChunkStreamsLegacy, cleanupInactiveMessageChunkStreams as cleanupInactiveMessageChunkStreamsLegacy, stopMessageChunkStream as stopMessageChunkStreamLegacy
} from './utils/cleanup';

