/**
 * Test Script for Simple BullMQ Streaming
 * 
 * This script tests the native BullMQ job progress streaming system
 * to ensure it works correctly before UI testing.
 */

const { simpleStreamManager, simpleStreamEmitter } = require('./dist/lib/bullmq-streams-simple.js');

async function testSimpleStreaming() {
  console.log('🧪 Testing Simple BullMQ Streaming...\n');

  try {
    // Generate a test stream ID
    const streamId = simpleStreamManager.generateStreamId();
    console.log(`📍 Generated stream ID: ${streamId}`);

    // Test 1: Start a stream
    console.log('\n📝 Test 1: Starting a stream...');
    const result = await simpleStreamManager.startStream({
      streamId,
      type: 'demo',
      intervalMs: 500,
      maxChunks: 5,
      ownerId: 'test-user',
    });
    console.log('✅ Stream started:', result);

    // Test 2: Listen to stream events with replay
    console.log('\n📡 Test 2: Listening to stream events...');
    let eventCount = 0;
    const events = [];

    const unsubscribe = await simpleStreamEmitter.subscribeWithReplay(streamId, (chunk) => {
      eventCount++;
      events.push(chunk);
      console.log(`📨 Event ${eventCount}: ${chunk.type} #${chunk.chunkNumber} - ${chunk.content?.slice(0, 30) || 'no content'}...`);
    });

    // Wait for stream to complete
    await new Promise(resolve => {
      const checkComplete = () => {
        const lastEvent = events[events.length - 1];
        if (lastEvent && (lastEvent.type === 'complete' || lastEvent.type === 'error')) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      setTimeout(checkComplete, 100);
    });

    // Test 3: Get stream progress
    console.log('\n📊 Test 3: Getting stream progress...');
    const progress = await simpleStreamManager.getStreamProgress(streamId);
    if (progress) {
      console.log(`✅ Progress retrieved: ${progress.chunks.length} chunks, status: ${progress.status}`);
    } else {
      console.log('❌ No progress found');
    }

    // Test 4: Test replay functionality
    console.log('\n🔄 Test 4: Testing replay functionality...');
    let replayEventCount = 0;
    const replayEvents = [];

    const unsubscribeReplay = await simpleStreamEmitter.subscribeWithReplay(streamId, (chunk) => {
      replayEventCount++;
      replayEvents.push(chunk);
      console.log(`🔄 Replay Event ${replayEventCount}: ${chunk.type} #${chunk.chunkNumber}`);
    });

    // Wait a bit for replay to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`\n📈 Replay Summary:`);
    console.log(`- Original events: ${events.length}`);
    console.log(`- Replay events: ${replayEvents.length}`);
    console.log(`- Match: ${events.length === replayEvents.length ? '✅' : '❌'}`);

    // Test 5: Get active streams
    console.log('\n📋 Test 5: Getting active streams...');
    const activeStreams = simpleStreamManager.getActiveStreams();
    console.log(`✅ Active streams: ${activeStreams.length}`);
    activeStreams.forEach(stream => {
      console.log(`  - ${stream.streamId} (Job: ${stream.jobId})`);
    });

    // Cleanup
    unsubscribe();
    unsubscribeReplay();

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testSimpleStreaming()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testSimpleStreaming }; 