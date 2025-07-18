import {
  Analytics,
  Circle,
  CloudQueue,
  Headphones,
  PlayArrow,
  Refresh,
  Settings,
  Stop,
  Timer,
  Work
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { trpc } from '../../services/trpc';

interface StreamData {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  data?: { content?: string; [key: string]: unknown };
  timestamp: string;
  error?: string;
  jobId?: string;
  progress?: {
    current: number;
    total?: number;
    percentage?: number;
  };
}

export const StreamTestBullMQ: React.FC = () => {
  const [streamId, setStreamId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState<string>('');
  const [streamChunks, setStreamChunks] = useState<StreamData[]>([]);
  const [intervalMs, setIntervalMs] = useState(100);
  const [streamType, setStreamType] = useState<'demo' | 'ai' | 'custom'>('demo');
  const [maxChunks, setMaxChunks] = useState(1000);
  const [currentJobId, setCurrentJobId] = useState<string>('');
  const [streamStartTime, setStreamStartTime] = useState<Date | null>(null);
  const [streamEndTime, setStreamEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [progress, setProgress] = useState<{ current: number; total?: number; percentage?: number } | null>(null);

  // Generate stream ID mutation
  const generateStreamId = trpc.streamBullMQ.generateStreamId.useQuery();

  // Stream listening mutation (BullMQ version)
  const listenToStreamMutation = trpc.streamBullMQ.listenToStream.useMutation({
    onSuccess: async (streamGenerator: any) => {
      console.log('BullMQ stream listening started');
      let accumulatedContent = '';
      let hasReceivedEvents = false;
      
      try {
        for await (const chunk of streamGenerator) {
          console.log('BullMQ stream event received:', chunk);
          hasReceivedEvents = true;
          
          setStreamChunks(prev => [...prev.slice(-19), chunk]); // Keep last 20 events
          
          // Update progress
          if (chunk.progress) {
            setProgress(chunk.progress);
          }
          
          if (chunk.type === 'start') {
            // Reset content on start
            accumulatedContent = '';
            setStreamContent('');
            setProgress(null);
          } else if (chunk.type === 'chunk' && chunk.data && 'content' in chunk.data && typeof chunk.data.content === 'string') {
            // Accumulate delta content from chunks
            accumulatedContent += chunk.data.content;
            setStreamContent(accumulatedContent);
          } else if (chunk.type === 'complete') {
            setIsStreaming(false);
            setStreamEndTime(new Date());
          } else if (chunk.type === 'error') {
            setIsStreaming(false);
            setStreamEndTime(new Date());
          }
        }
        
        // If no events were received, it means the stream was already completed
        if (!hasReceivedEvents) {
          console.log('No events received - stream was already completed or not found');
          setIsStreaming(false);
          setStreamEndTime(new Date());
        } else {
          // Stream ended naturally
          console.log('BullMQ stream ended - completion or error occurred');
          setIsStreaming(false);
          setStreamEndTime(new Date());
        }
      } catch (error: any) {
        console.error('BullMQ stream processing error:', error);
        setIsStreaming(false);
        setStreamEndTime(new Date());
      }
    },
    onError: (error: any) => {
      console.error('BullMQ stream listening error:', error);
      setIsStreaming(false);
      setStreamEndTime(new Date());
    },
  });

  // Manage stream mutation
  const manageStreamMutation = trpc.streamBullMQ.manageStream.useMutation({
    onSuccess: (data: any) => {
      console.log('BullMQ stream management success:', data);
      if (data.message === 'Stream started') {
        setIsStreaming(true);
        setStreamContent('');
        setStreamChunks([]);
        setCurrentJobId(data.jobId || '');
        setStreamStartTime(new Date());
        setStreamEndTime(null);
        setElapsedTime(0);
        setProgress(null);
        
        // Start listening to the stream
        listenToStreamMutation.mutate({ 
          streamId: data.streamId,
        });
      } else if (data.message === 'Stream stopped') {
        setIsStreaming(false);
        setStreamEndTime(new Date());
      }
    },
    onError: (error: any) => {
      console.error('BullMQ stream management error:', error);
      setIsStreaming(false);
      setStreamEndTime(new Date());
    },
  });

  // Get active streams query
  const activeStreamsQuery = trpc.streamBullMQ.getActiveStreams.useQuery(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Get queue metrics
  const queueMetricsQuery = trpc.streamBullMQ.getQueueMetrics.useQuery(undefined, {
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // Get stored events query (for debugging replay)
  const storedEventsQuery = trpc.streamBullMQ.getStoredEvents.useQuery(
    { streamId },
    { 
      enabled: !!streamId,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  // Clear stored events mutation (for testing)
  const clearStoredEventsMutation = trpc.streamBullMQ.clearStoredEvents.useMutation({
    onSuccess: () => {
      console.log('✅ Stored events cleared');
      storedEventsQuery.refetch();
    },
  });

  // Get stream status
  const streamStatusQuery = trpc.streamBullMQ.getStreamStatus.useQuery(
    { streamId },
    { 
      enabled: !!streamId && !!currentJobId,
      refetchInterval: 1000, // Refresh every second
      retry: false,
    }
  );

  // Generate initial stream ID
  useEffect(() => {
    if (generateStreamId.data?.streamId && !streamId) {
      setStreamId(generateStreamId.data.streamId);
    }
  }, [generateStreamId.data, streamId]);

  // Timer effect - updates elapsed time every 100ms while streaming
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (streamStartTime && !streamEndTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = now.getTime() - streamStartTime.getTime();
        setElapsedTime(elapsed);
      }, 100);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [streamStartTime, streamEndTime]);

  const handleStartStream = () => {
    if (!streamId) return;
    
    manageStreamMutation.mutate({
      streamId,
      action: 'start',
      intervalMs,
      streamType,
      maxChunks,
    });
  };

  const handleStopStream = () => {
    if (!streamId) return;
    
    manageStreamMutation.mutate({
      streamId,
      action: 'stop',
      intervalMs,
      streamType,
      maxChunks,
    });
  };

  const handleGenerateNewStreamId = () => {
    generateStreamId.refetch().then((result) => {
      if (result.data?.streamId) {
        setStreamId(result.data.streamId);
        setStreamContent('');
        setStreamChunks([]);
        setCurrentJobId('');
        setIsStreaming(false);
        setStreamStartTime(null);
        setStreamEndTime(null);
        setElapsedTime(0);
        setProgress(null);
      }
    }).catch((error) => {
      console.error('Error generating stream ID:', error);
    });
  };

  const handleResumeStream = () => {
    if (!streamId) return;
    
    // Resume listening to the stream (with replay)
    listenToStreamMutation.mutate({ 
      streamId,
    });
  };

  const handleTestReplay = () => {
    if (!streamId) return;
    
    console.log('🔄 Testing replay functionality...');
    
    // Clear current UI state to see replay effect
    setStreamContent('');
    setStreamChunks([]);
    setProgress(null);
    
    // Start listening with replay
    listenToStreamMutation.mutate({ 
      streamId,
    });
  };

  const handleRefreshStoredEvents = () => {
    storedEventsQuery.refetch();
  };

  const handleClearStoredEvents = () => {
    if (!streamId) return;
    
    clearStoredEventsMutation.mutate({ streamId });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatElapsedTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}.${Math.floor(ms / 100)}s`;
    } else {
      return `${remainingSeconds}.${Math.floor(ms / 100)}s`;
    }
  };

  const getCurrentElapsedTime = () => {
    if (!streamStartTime) return 0;
    if (streamEndTime) {
      return streamEndTime.getTime() - streamStartTime.getTime();
    }
    return elapsedTime;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* Header and Controls */}
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom>
              BullMQ Stream Test
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              <strong>BullMQ Job Queues:</strong> Streams are processed as distributed jobs with 
              automatic retries, progress tracking, and cross-instance coordination.
            </Alert>
            
            <Stack spacing={3}>
              <Grid container spacing={2} alignItems="end">
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Stream ID"
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    placeholder="Enter stream ID"
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    label="Interval (ms)"
                    type="number"
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                    inputProps={{ min: 100, max: 5000 }}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    label="Max Chunks"
                    type="number"
                    value={maxChunks}
                    onChange={(e) => setMaxChunks(Number(e.target.value))}
                    inputProps={{ min: 10, max: 10000 }}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Stream Type</InputLabel>
                    <Select
                      value={streamType}
                      onChange={(e) => setStreamType(e.target.value as 'demo' | 'ai' | 'custom')}
                      label="Stream Type"
                    >
                      <MenuItem value="demo">Demo</MenuItem>
                      <MenuItem value="ai">AI Simulation</MenuItem>
                      <MenuItem value="custom">Custom</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={manageStreamMutation.isPending ? <CircularProgress size={16} /> : <PlayArrow />}
                  onClick={handleStartStream}
                  disabled={!streamId || isStreaming || manageStreamMutation.isPending}
                >
                  {manageStreamMutation.isPending ? 'Starting...' : 'Start Stream'}
                </Button>
                
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<Stop />}
                  onClick={handleStopStream}
                  disabled={!streamId}
                >
                  {manageStreamMutation.isPending ? 'Stopping...' : 'Stop Stream'}
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={handleGenerateNewStreamId}
                  disabled={isStreaming}
                >
                  New Stream ID
                </Button>
                
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={listenToStreamMutation.isPending ? <CircularProgress size={16} /> : <Headphones />}
                  onClick={handleResumeStream}
                  disabled={!streamId || listenToStreamMutation.isPending}
                >
                  {listenToStreamMutation.isPending ? 'Listening...' : 'Resume/Listen'}
                </Button>

                <Button
                  variant="contained"
                  color="info"
                  startIcon={<Analytics />}
                  onClick={handleTestReplay}
                  disabled={!streamId || listenToStreamMutation.isPending}
                >
                  Test Replay
                </Button>
              </Stack>

              {/* Debugging Controls */}
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Settings />}
                  onClick={handleRefreshStoredEvents}
                  disabled={!streamId}
                >
                  Refresh Stored Events
                </Button>
                
                <Button
                  variant="outlined"
                  size="small"
                  color="warning"
                  onClick={handleClearStoredEvents}
                  disabled={!streamId || clearStoredEventsMutation.isPending}
                >
                  {clearStoredEventsMutation.isPending ? 'Clearing...' : 'Clear Stored Events'}
                </Button>

                {storedEventsQuery.data && (
                  <Chip
                    label={`Stored: ${storedEventsQuery.data.eventCount} events`}
                    color={storedEventsQuery.data.hasEvents ? 'success' : 'default'}
                    variant="outlined"
                    size="small"
                  />
                )}
              </Stack>

              {/* Status and Progress */}
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                  <Chip
                    icon={<Circle sx={{ color: isStreaming ? 'success.main' : 'grey.400' }} />}
                    label={isStreaming ? 'Streaming...' : 'Stopped'}
                    color={isStreaming ? 'success' : 'default'}
                    variant="outlined"
                  />
                  {currentJobId && (
                    <Chip
                      icon={<Work />}
                      label={`Job: ${currentJobId.slice(-8)}`}
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  )}
                  {streamStartTime && (
                    <Chip
                      icon={<Timer />}
                      label={formatElapsedTime(getCurrentElapsedTime())}
                      color={streamEndTime ? 'success' : 'primary'}
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  )}
                </Stack>

                {/* Progress Bar */}
                {progress && (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Progress: {progress.current} / {progress.total || '?'} chunks
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {progress.percentage || 0}%
                      </Typography>
                    </Stack>
                    <LinearProgress 
                      variant={progress.percentage !== undefined ? "determinate" : "indeterminate"}
                      value={progress.percentage || 0}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                )}

                {/* Stream Status */}
                {streamStatusQuery.data && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                      <Chip
                        label={`State: ${streamStatusQuery.data.state}`}
                        color={streamStatusQuery.data.state === 'active' ? 'success' : 
                               streamStatusQuery.data.state === 'completed' ? 'info' : 'default'}
                        size="small"
                      />
                      <Typography variant="body2" color="text.secondary">
                        Type: {streamStatusQuery.data.data?.type || 'unknown'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Created: {new Date(streamStatusQuery.data.createdAt).toLocaleTimeString()}
                      </Typography>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {/* Stream Content */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stream Content ({streamContent.length} chars)
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 200,
                maxHeight: 400,
                overflow: 'auto',
                bgcolor: 'grey.50',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {streamContent || 'No content yet...'}
            </Paper>
          </CardContent>
        </Card>

        {/* Stream Event Log */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Events ({streamChunks.length}/20)
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Stack spacing={1}>
                {streamChunks.map((chunk, index) => (
                  <Paper
                    key={chunk.jobId || index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor: chunk.type === 'start' ? 'info.light' :
                              chunk.type === 'chunk' ? 'grey.100' :
                              chunk.type === 'complete' ? 'success.light' : 'error.light',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={chunk.type}
                          size="small"
                          color={chunk.type === 'start' ? 'info' :
                                 chunk.type === 'chunk' ? 'default' :
                                 chunk.type === 'complete' ? 'success' : 'error'}
                        />
                        {chunk.jobId && (
                          <Chip
                            label={chunk.jobId.slice(-8)}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                          />
                        )}
                        {chunk.progress && (
                          <Chip
                            label={`${chunk.progress.current}/${chunk.progress.total || '?'}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(chunk.timestamp)}
                      </Typography>
                    </Stack>
                    {chunk.data && 'content' in chunk.data && chunk.data.content && (
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 1,
                          p: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          bgcolor: 'background.paper',
                        }}
                      >
                        "{chunk.data.content}"
                      </Paper>
                    )}
                    {chunk.error && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        {chunk.error}
                      </Alert>
                    )}
                  </Paper>
                ))}
                {streamChunks.length === 0 && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                    No events yet...
                  </Typography>
                )}
              </Stack>
            </Box>
          </CardContent>
        </Card>

        {/* Queue Metrics Dashboard */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <CloudQueue sx={{ mr: 1, verticalAlign: 'middle' }} />
              BullMQ Queue Metrics
            </Typography>
            {queueMetricsQuery.data ? (
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Waiting</Typography>
                    <Typography variant="h6" color="warning.main">
                      {queueMetricsQuery.data.waiting}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Active</Typography>
                    <Typography variant="h6" color="success.main">
                      {queueMetricsQuery.data.active}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Completed</Typography>
                    <Typography variant="h6" color="info.main">
                      {queueMetricsQuery.data.completed}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Failed</Typography>
                    <Typography variant="h6" color="error.main">
                      {queueMetricsQuery.data.failed}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                Loading queue metrics...
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Active Streams Status */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Streams
            </Typography>
            <Stack spacing={1}>
              {activeStreamsQuery.data ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle2">
                      Active Streams: {activeStreamsQuery.data.activeStreams.length}
                    </Typography>
                    
                    {activeStreamsQuery.data.activeStreams.length > 0 && (
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Stream Details:
                        </Typography>
                        <Stack spacing={1}>
                          {activeStreamsQuery.data.activeStreams.map((stream) => (
                            <Paper key={stream.streamId} variant="outlined" sx={{ p: 1.5 }}>
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Chip 
                                  label={stream.streamId} 
                                  size="small" 
                                  sx={{ fontFamily: 'monospace' }}
                                />
                                <Chip 
                                  label={`Job: ${stream.jobId.slice(-8)}`} 
                                  size="small" 
                                  variant="outlined"
                                  sx={{ fontFamily: 'monospace' }}
                                />
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>
                    )}
                    
                    <Typography variant="body2" color="text.secondary">
                      {activeStreamsQuery.data.note}
                    </Typography>
                  </Stack>
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                  Loading stream status...
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}; 