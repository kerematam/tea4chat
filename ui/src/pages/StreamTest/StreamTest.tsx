import React, { useState, useEffect } from 'react';
import { trpc } from '../../services/trpc';

interface StreamData {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  content?: string;
  fullContent?: string;
  timestamp: string;
  error?: string;
}

export const StreamTest: React.FC = () => {
  const [streamId, setStreamId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState<string>('');
  const [streamChunks, setStreamChunks] = useState<StreamData[]>([]);
  const [intervalMs, setIntervalMs] = useState(1000);

  // Generate stream ID mutation
  const generateStreamId = trpc.stream.generateStreamId.useQuery();

  // Stream listening mutation (like sendWithStream)
  const listenToStreamMutation = trpc.stream.listenToStream.useMutation({
    onSuccess: async (streamGenerator) => {
      console.log('Stream listening started');
      try {
        for await (const chunk of streamGenerator) {
          console.log('Stream data received:', chunk);
          
          setStreamChunks(prev => [...prev, chunk]);
          
          if (chunk.type === 'start' && chunk.fullContent) {
            // On start/resume, set the full content
            setStreamContent(chunk.fullContent);
          } else if (chunk.type === 'chunk' && chunk.content) {
            // For chunks, append the delta content
            setStreamContent(prev => prev + chunk.content);
          } else if (chunk.type === 'complete') {
            setIsStreaming(false);
            // Use fullContent if provided, otherwise keep current content
            if (chunk.fullContent !== undefined) {
              setStreamContent(chunk.fullContent);
            }
          } else if (chunk.type === 'error') {
            setIsStreaming(false);
            console.error('Stream error:', chunk.error);
          }
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        setIsStreaming(false);
      }
    },
    onError: (error) => {
      console.error('Stream listening error:', error);
      setIsStreaming(false);
    },
  });

  // Function to start listening to a stream
  const startListening = () => {
    if (!streamId) return;
    
    listenToStreamMutation.mutate({ streamId });
  };

  // Manage stream mutation
  const manageStreamMutation = trpc.stream.manageStream.useMutation({
    onSuccess: (data) => {
      console.log('Stream management success:', data);
      if (data.message === 'Stream started') {
        setIsStreaming(true);
        setStreamContent('');
        setStreamChunks([]);
        // Start listening to the stream
        startListening();
      } else if (data.message === 'Stream stopped') {
        setIsStreaming(false);
      }
    },
    onError: (error) => {
      console.error('Stream management error:', error);
      setIsStreaming(false);
    },
  });

  // Get active streams query
  const activeStreamsQuery = trpc.stream.getActiveStreams.useQuery(undefined, {
    // refetchInterval: 2000, // Refresh every 2 seconds,
  });

  // Generate initial stream ID
  useEffect(() => {
    if (generateStreamId.data?.streamId && !streamId) {
      setStreamId(generateStreamId.data.streamId);
    }
  }, [generateStreamId.data, streamId]);

  const handleStartStream = () => {
    if (!streamId) return;
    
    manageStreamMutation.mutate({
      streamId,
      action: 'start',
      intervalMs,
    });
  };

  const handleStopStream = () => {
    if (!streamId) return;
    
    manageStreamMutation.mutate({
      streamId,
      action: 'stop',
      intervalMs,
    });
  };

  const handleGenerateNewStreamId = () => {
    generateStreamId.refetch().then((result) => {
      if (result.data?.streamId) {
        setStreamId(result.data.streamId);
        setStreamContent('');
        setStreamChunks([]);
        setIsStreaming(false);
      }
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Redis Stream Test
        </h1>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {streamContent}
        </div>
        {/* Stream Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stream ID
              </label>
              <input
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Enter stream ID"
              />
            </div>
            <div className="flex-none">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Interval (ms)
              </label>
              <input
                type="number"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                min="100"
                max="5000"
                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleStartStream}
              disabled={!streamId || isStreaming || manageStreamMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {manageStreamMutation.isPending ? 'Starting...' : 'Start Stream'}
            </button>
            
            <button
              onClick={handleStopStream}
              disabled={!streamId || !isStreaming || manageStreamMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {manageStreamMutation.isPending ? 'Stopping...' : 'Stop Stream'}
            </button>
            
            <button
              onClick={handleGenerateNewStreamId}
              disabled={isStreaming}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              New Stream ID
            </button>
            
            <button
              onClick={startListening}
              disabled={!streamId || listenToStreamMutation.isPending}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {listenToStreamMutation.isPending ? 'Listening...' : 'Listen to Stream'}
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isStreaming ? 'Streaming...' : 'Stopped'}
            </span>
          </div>
        </div>
      </div>

      {/* Stream Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Stream Content
        </h2>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {streamContent || 'No content yet...'}
          </pre>
        </div>
      </div>

      {/* Stream Chunks Log */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Stream Events ({streamChunks.length})
        </h2>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {streamChunks.slice(-20).map((chunk, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg text-sm ${
                chunk.type === 'start'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                  : chunk.type === 'chunk'
                  ? 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200'
                  : chunk.type === 'complete'
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-medium capitalize">{chunk.type}</span>
                <span className="text-xs opacity-75">
                  {formatTimestamp(chunk.timestamp)}
                </span>
              </div>
              {chunk.content && (
                <div className="mt-1 font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded">
                  "{chunk.content}"
                </div>
              )}
              {chunk.error && (
                <div className="mt-1 text-red-600 dark:text-red-400">
                  Error: {chunk.error}
                </div>
              )}
            </div>
          ))}
          {streamChunks.length === 0 && (
            <div className="text-gray-500 dark:text-gray-400 text-center py-8">
              No events yet...
            </div>
          )}
        </div>
      </div>

      {/* Active Streams */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Active Streams ({activeStreamsQuery.data?.count || 0})
        </h2>
        <div className="space-y-2">
          {activeStreamsQuery.data?.activeStreams.map((stream) => (
            <div
              key={stream.streamId}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <div className="flex justify-between items-start text-sm">
                <div>
                  <div className="font-mono text-xs text-gray-600 dark:text-gray-400">
                    {stream.streamId}
                  </div>
                  <div className="text-gray-800 dark:text-gray-200">
                    Status: {stream.status}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <div>Started: {stream.startedAt && formatTimestamp(stream.startedAt)}</div>
                  {stream.updatedAt && (
                    <div>Updated: {formatTimestamp(stream.updatedAt)}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(!activeStreamsQuery.data?.activeStreams.length) && (
            <div className="text-gray-500 dark:text-gray-400 text-center py-4">
              No active streams
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 