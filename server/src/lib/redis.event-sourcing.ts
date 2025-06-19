import Redis from 'ioredis';


// export const STREAM_COMPLETED_TTL = 3600; // 1 hour for completed streams

// this is used for redis to clean up streams after 1 minute
export const STREAM_TTL = 60; // 1 minute

// Create Redis client
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

// Separate Redis client for pub/sub
const redisPubSub = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

export const streamHelpers = {
    keys: {
        // Redis Stream for storing all events
        streamEvents: (streamId: string) => `stream:events:${streamId}`,
        // Redis key for stream metadata
        streamMeta: (streamId: string) => `stream:meta:${streamId}`,
        // Pub/sub channel for real-time notifications
        streamChannel: (streamId: string) => `stream:channel:${streamId}`,
    },

    // Create a new stream
    createStream: async (streamId: string, metadata: any) => {
        const metaKey = streamHelpers.keys.streamMeta(streamId);
        const streamKey = streamHelpers.keys.streamEvents(streamId);

        const streamData = {
            startedAt: new Date().toISOString(),
            status: 'active',
            ...metadata
        };

        // Store metadata with TTL
        await redis.setex(metaKey, STREAM_TTL, JSON.stringify(streamData));

        // Add initial event to stream
        await redis.xadd(
            streamKey,
            '*', // Auto-generate ID
            'type', 'start',
            'streamId', streamId,
            'timestamp', streamData.startedAt,
            'data', JSON.stringify({ type: 'start', streamId, timestamp: streamData.startedAt })
        );

        // Set TTL on the entire stream - all events expire together
        await redis.expire(streamKey, STREAM_TTL);

        return streamData;
    },

    // Add a chunk event (NO state accumulation!)
    addChunk: async (streamId: string, chunk: string) => {
        const streamKey = streamHelpers.keys.streamEvents(streamId);
        const metaKey = streamHelpers.keys.streamMeta(streamId);

        // Check if stream still exists
        const metaExists = await redis.exists(metaKey);
        if (!metaExists) {
            return null; // Stream expired
        }

        const timestamp = new Date().toISOString();

        // Add chunk as individual event (no reading/parsing existing data!)
        const eventId = await redis.xadd(
            streamKey,
            '*', // Auto-generate ID
            'type', 'chunk',
            'streamId', streamId,
            'content', chunk,
            'timestamp', timestamp
        );

        // Update metadata timestamp and reset TTL for both metadata and stream
        const currentMeta = await redis.get(metaKey);
        if (currentMeta) {
            const metaData = JSON.parse(currentMeta);
            metaData.lastActivity = timestamp;
            await redis.setex(metaKey, STREAM_TTL, JSON.stringify(metaData)); // Reset metadata TTL
            await redis.expire(streamKey, STREAM_TTL); // Reset stream TTL - keeps ALL events alive together
        }

        // Publish real-time notification (just the chunk)
        const channel = streamHelpers.keys.streamChannel(streamId);
        await redisPubSub.publish(channel, JSON.stringify({
            type: 'chunk',
            streamId,
            content: chunk,
            timestamp,
            eventId
        }));

        return { eventId, timestamp };
    },

    // Complete stream
    completeStream: async (streamId: string, finalData?: any) => {
        const streamKey = streamHelpers.keys.streamEvents(streamId);
        const metaKey = streamHelpers.keys.streamMeta(streamId);
        const timestamp = new Date().toISOString();

        // Add completion event
        await redis.xadd(
            streamKey,
            '*',
            'type', 'complete',
            'streamId', streamId,
            'timestamp', timestamp,
            'data', JSON.stringify(finalData || {})
        );

        // Update metadata and set longer TTL for completed streams
        const currentMeta = await redis.get(metaKey);
        if (currentMeta) {
            const metaData = JSON.parse(currentMeta);
            metaData.status = 'completed';
            metaData.completedAt = timestamp;
            await redis.setex(metaKey, STREAM_TTL, JSON.stringify(metaData));
            await redis.expire(streamKey, STREAM_TTL);
        }

        // Publish completion
        const channel = streamHelpers.keys.streamChannel(streamId);
        await redisPubSub.publish(channel, JSON.stringify({
            type: 'complete',
            streamId,
            timestamp,
            data: finalData
        }));

        return { timestamp };
    },

    // Get ALL events from stream start (for resume functionality)
    getStreamEvents: async (streamId: string, fromId = '0') => {
        const streamKey = streamHelpers.keys.streamEvents(streamId);

        try {
            // Read all events from the stream
            const events = await redis.xrange(streamKey, fromId, '+');

            return events.map(([id, fields]) => {
                // Parse Redis stream entry
                const event: any = { id };
                for (let i = 0; i < fields.length; i += 2) {
                    const key = fields[i];
                    const value = fields[i + 1];

                    if (key && value) {
                        if (key === 'data') {
                            try {
                                event[key] = JSON.parse(value);
                            } catch {
                                event[key] = value;
                            }
                        } else {
                            event[key] = value;
                        }
                    }
                }
                return event;
            });
        } catch (error) {
            console.error('Error reading stream events:', error);
            return [];
        }
    },

    // Build accumulated content from events (only when needed)
    buildContentFromEvents: (events: any[]) => {
        let content = '';
        const chunks: string[] = [];

        for (const event of events) {
            if (event.type === 'chunk' && event.content) {
                content += event.content;
                chunks.push(event.content);
            }
        }

        return { content, chunks, eventCount: events.length };
    },

    // Get stream metadata
    getStreamMeta: async (streamId: string) => {
        const metaKey = streamHelpers.keys.streamMeta(streamId);
        const data = await redis.get(metaKey);
        return data ? JSON.parse(data) : null;
    },

    // Subscribe to real-time events
    subscribeToStream: (streamId: string, callback: (event: any) => void) => {
        const channel = streamHelpers.keys.streamChannel(streamId);
        const subscriber = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
        });

        subscriber.subscribe(channel);
        subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const event = JSON.parse(message);
                    callback(event);
                } catch (error) {
                    console.error('Error parsing stream event:', error);
                }
            }
        });

        return subscriber;
    },

    // Cleanup helpers
    cleanup: {
        // Get stream info
        getStreamInfo: async (streamId: string) => {
            const streamKey = streamHelpers.keys.streamEvents(streamId);
            const metaKey = streamHelpers.keys.streamMeta(streamId);

            const [streamInfo, metaData] = await Promise.all([
                redis.xinfo('STREAM', streamKey).catch(() => null),
                redis.get(metaKey).then(data => data ? JSON.parse(data) : null)
            ]);

            return { streamInfo, metaData };
        },

        // Delete expired streams
        deleteStream: async (streamId: string) => {
            const streamKey = streamHelpers.keys.streamEvents(streamId);
            const metaKey = streamHelpers.keys.streamMeta(streamId);

            await Promise.all([
                redis.del(streamKey),
                redis.del(metaKey)
            ]);
        }
    },

    // Get TTL info for debugging unified expiration
    getTTLInfo: async (streamId: string) => {
        const streamKey = streamHelpers.keys.streamEvents(streamId);
        const metaKey = streamHelpers.keys.streamMeta(streamId);

        const [streamTTL, metaTTL] = await Promise.all([
            redis.ttl(streamKey),
            redis.ttl(metaKey)
        ]);

        return {
            streamId,
            streamTTL: streamTTL === -1 ? 'no expiry' : streamTTL === -2 ? 'key not found' : `${streamTTL}s`,
            metaTTL: metaTTL === -1 ? 'no expiry' : metaTTL === -2 ? 'key not found' : `${metaTTL}s`,
            synchronized: Math.abs(streamTTL - metaTTL) <= 1 // Allow 1s difference due to timing
        };
    }
};

export { redisPubSub };
export default redis; 