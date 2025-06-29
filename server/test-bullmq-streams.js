/**
 * Test Script for BullMQ Streaming System
 * 
 * This script demonstrates the BullMQ-based streaming infrastructure
 * without requiring the full tRPC/UI setup.
 */

// Import the BullMQ streaming infrastructure
const { 
  streamManager, 
  streamEventEmitter,
  getQueueMetrics 
} = require('./dist/lib/bullmq-streams.js');

async function testBullMQStreaming() {
  console.log('🚀 Starting BullMQ Streaming Test\n');

  try {
    // 1. Generate a test stream ID
    const streamId = streamManager.generateStreamId();
    console.log(`📝 Generated Stream ID: ${streamId}`);

    // 2. Set up event listener
    console.log('🎧 Setting up event listener...');
    const events = [];
    const unsubscribe = streamEventEmitter.subscribe(streamId, (event) => {
      events.push(event);
      console.log(`📨 Event received: ${event.type} (${event.timestamp})`);
      
      if (event.type === 'chunk' && event.data) {
        console.log(`   Content: "${event.data.content}"`);
        console.log(`   Progress: ${event.progress?.current}/${event.progress?.total} (${event.progress?.percentage}%)`);
      }
    });

    // 3. Start a demo stream
    console.log('\n🟢 Starting demo stream...');
    const result = await streamManager.startStream({
      streamId,
      type: 'demo',
      intervalMs: 500,  // 500ms between chunks
      maxChunks: 10,    // Only 10 chunks for test
      ownerId: 'test-user',
    });
    
    console.log(`✅ Stream started: Job ID ${result.jobId}`);

    // 4. Check initial queue metrics
    const initialMetrics = await getQueueMetrics();
    console.log('\n📊 Initial Queue Metrics:', initialMetrics);

    // 5. Wait for stream to complete
    console.log('\n⏳ Waiting for stream to complete...');
    let isComplete = false;
    const timeout = setTimeout(() => {
      isComplete = true;
      console.log('⏰ Timeout reached');
    }, 15000); // 15 second timeout

    while (!isComplete) {
      // Check if stream is done
      const hasCompleteEvent = events.some(e => e.type === 'complete' || e.type === 'error');
      if (hasCompleteEvent) {
        isComplete = true;
        console.log('✅ Stream completed');
        break;
      }
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    clearTimeout(timeout);

    // 6. Get final metrics
    const finalMetrics = await getQueueMetrics();
    console.log('\n📊 Final Queue Metrics:', finalMetrics);

    // 7. Show event summary
    console.log('\n📋 Event Summary:');
    console.log(`   Total events: ${events.length}`);
    
    const eventCounts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // 8. Show accumulated content
    const chunkEvents = events.filter(e => e.type === 'chunk' && e.data?.content);
    const accumulatedContent = chunkEvents.map(e => e.data.content).join('');
    console.log('\n📄 Accumulated Content:');
    console.log(`"${accumulatedContent}"`);
    console.log(`Length: ${accumulatedContent.length} characters`);

    // 9. Get active streams (should be empty now)
    const activeStreams = streamManager.getActiveStreams();
    console.log('\n🔄 Active Streams:', activeStreams.length);

    // 10. Cleanup
    unsubscribe();
    await streamManager.cleanup();
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testBullMQStreaming()
    .then(() => {
      console.log('\n👋 Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { testBullMQStreaming }; 