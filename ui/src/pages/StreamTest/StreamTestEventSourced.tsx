import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  TextField,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Badge,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Headphones,
  Circle,
  CloudDownload,
  EventNote,
  Timer,
} from '@mui/icons-material';
import { trpc } from '../../services/trpc';

interface StreamData {
  type: 'start' | 'chunk' | 'complete' | 'error';
  streamId: string;
  data?: { content?: string; [key: string]: unknown };
  timestamp: string;
  error?: string;
  eventId?: string;
}

export const StreamTestEventSourced: React.FC = () => {
  const [streamId, setStreamId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState<string>('');
  const [streamChunks, setStreamChunks] = useState<StreamData[]>([]);
  const [intervalMs, setIntervalMs] = useState(100);
  const [fromEventId, setFromEventId] = useState<string>('0');
  const [totalEventCount, setTotalEventCount] = useState(0);
  const [streamStartTime, setStreamStartTime] = useState<Date | null>(null);
  const [streamEndTime, setStreamEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Generate stream ID mutation
  const generateStreamId = trpc.streamEventSourced.generateStreamId.useQuery();

  // Stream content query (for resume functionality)
  const streamContentQuery = trpc.streamEventSourced.getStreamContent.useQuery(
    { streamId },
    { 
      enabled: !!streamId,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  // Stream listening mutation (event-sourced version)
  const listenToStreamMutation = trpc.streamEventSourced.listenToStream.useMutation({
    onSuccess: async (streamGenerator) => {
      console.log('Event-sourced stream listening started');
      let accumulatedContent = '';
      let eventCount = 0;
      let hasReceivedEvents = false;
      
      try {
        for await (const chunk of streamGenerator) {
          console.log('Stream event received:', chunk);
          eventCount++;
          hasReceivedEvents = true;
          
          setStreamChunks(prev => [...prev.slice(-19), chunk]); // Keep last 20 events
          setTotalEventCount(eventCount);
          
          if (chunk.type === 'start') {
            // Reset content on start
            accumulatedContent = '';
            setStreamContent('');
          } else if (chunk.type === 'chunk' && chunk.data && 'content' in chunk.data && typeof chunk.data.content === 'string') {
            // Accumulate delta content from chunks
            accumulatedContent += chunk.data.content;
            setStreamContent(accumulatedContent);
          }
        }
        
        // If no events were received, it means the stream was already completed
        if (!hasReceivedEvents) {
          console.log('No events received - stream was already completed or not found');
          setIsStreaming(false);
          setStreamEndTime(new Date());
        } else {
          // Stream ended naturally (completion/error event arrived but wasn't yielded)
          console.log('Stream ended - completion or error occurred');
          setIsStreaming(false);
          setStreamEndTime(new Date());
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        setIsStreaming(false);
        setStreamEndTime(new Date());
      }
    },
    onError: (error) => {
      console.error('Stream listening error:', error);
      setIsStreaming(false);
      setStreamEndTime(new Date());
    },
  });

  // Function to start listening to a stream
  const startListening = (resumeFromEventId?: string) => {
    if (!streamId) return;
    
    listenToStreamMutation.mutate({ 
      streamId,
      fromEventId: resumeFromEventId || fromEventId
    });
  };

  // Manage stream mutation
  const manageStreamMutation = trpc.streamEventSourced.manageStream.useMutation({
    onSuccess: (data) => {
      console.log('Stream management success:', data);
      if (data.message === 'Stream started') {
        setIsStreaming(true);
        setStreamContent('');
        setStreamChunks([]);
        setTotalEventCount(0);
        setStreamStartTime(new Date());
        setStreamEndTime(null);
        setElapsedTime(0);
        // Start listening to the stream from beginning
        startListening('0');
      } else if (data.message === 'Stream stopped') {
        setIsStreaming(false);
        setStreamEndTime(new Date());
      }
    },
    onError: (error) => {
      console.error('Stream management error:', error);
      setIsStreaming(false);
      setStreamEndTime(new Date());
    },
  });

  // Get active streams query (simplified in event-sourced version)
  const activeStreamsQuery = trpc.streamEventSourced.getActiveStreams.useQuery();

  // Get TTL info for current stream
  const streamTTLQuery = trpc.streamEventSourced.getStreamTTL.useQuery(
    { streamId },
    { 
      enabled: !!streamId,
    //   refetchInterval: 1000, // Refresh every second to see TTL countdown
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
        setTotalEventCount(0);
        setIsStreaming(false);
        setFromEventId('0');
        setStreamStartTime(null);
        setStreamEndTime(null);
        setElapsedTime(0);
      }
    }).catch((error) => {
      console.error('Error generating stream ID:', error);
    });
  };

  const handleResumeStream = () => {
    if (!streamId) return;
    
    // Resume from current position
    startListening(fromEventId);
  };

  const handleLoadStreamContent = () => {
    if (!streamId) return;
    
    streamContentQuery.refetch().then((result) => {
      if (result.data) {
        const { content, events, eventCount } = result.data;
        setStreamContent(content || '');
        setTotalEventCount(eventCount);
        
        // Convert stored events to stream chunks for display
        const chunks = events.slice(-20).map(event => ({
          type: event.type as StreamData['type'],
          streamId,
          data: event.content ? { content: event.content } : undefined,
          timestamp: event.timestamp,
          eventId: event.id,
        }));
        setStreamChunks(chunks);
        
        // Set fromEventId to last event for resume
        if (events.length > 0) {
          setFromEventId(events[events.length - 1].id);
        }
      }
    });
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
              Redis Event-Sourced Stream Test
            </Typography>
            <Alert severity="success" sx={{ mb: 3 }}>
              <strong>Event Sourcing:</strong> Each chunk is stored as a separate Redis Stream event. 
              Perfect for resumable streams with constant-size writes and efficient event replay.
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
                <Grid item xs={12} md={2}>
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
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="From Event ID"
                    value={fromEventId}
                    onChange={(e) => setFromEventId(e.target.value)}
                    placeholder="0"
                    variant="outlined"
                    size="small"
                  />
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
                  color="warning"
                  startIcon={streamContentQuery.isFetching ? <CircularProgress size={16} /> : <CloudDownload />}
                  onClick={handleLoadStreamContent}
                  disabled={!streamId || streamContentQuery.isFetching}
                >
                  {streamContentQuery.isFetching ? 'Loading...' : 'Load Saved Content'}
                </Button>
              </Stack>

              {/* Status */}
              <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                <Chip
                  icon={<Circle sx={{ color: isStreaming ? 'success.main' : 'grey.400' }} />}
                  label={isStreaming ? 'Streaming...' : 'Stopped'}
                  color={isStreaming ? 'success' : 'default'}
                  variant="outlined"
                />
                <Badge badgeContent={totalEventCount} color="primary">
                  <Chip
                    icon={<EventNote />}
                    label="Events"
                    variant="outlined"
                  />
                </Badge>
                {streamStartTime && (
                  <Chip
                    icon={<Timer />}
                    label={formatElapsedTime(getCurrentElapsedTime())}
                    color={streamEndTime ? 'success' : 'primary'}
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                )}
                                 {streamContentQuery.data && (
                   <Chip
                     label={`Saved: ${streamContentQuery.data.eventCount} events`}
                     color="info"
                     variant="outlined"
                   />
                 )}
                 {streamTTLQuery.data && (
                   <Chip
                     label={`TTL: ${streamTTLQuery.data.streamTTL} | Meta: ${streamTTLQuery.data.metaTTL}`}
                     color={streamTTLQuery.data.synchronized ? 'success' : 'warning'}
                     variant="outlined"
                     size="small"
                   />
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
                    key={chunk.eventId || index}
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
                        {chunk.eventId && (
                          <Chip
                            label={chunk.eventId}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
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

        {/* Active Streams Status */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Streams
            </Typography>
            <Stack spacing={1}>
              {activeStreamsQuery.data ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">
                      In-Memory Active Streams: {activeStreamsQuery.data.inMemoryCount}
                    </Typography>
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

        {/* Stream Content Query Results */}
        {streamContentQuery.data && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Stored Stream Data
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Content Length</Typography>
                    <Typography variant="h6" color="primary">
                      {streamContentQuery.data.content?.length || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">chars</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Event Count</Typography>
                    <Typography variant="h6" color="secondary">
                      {streamContentQuery.data.eventCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">events</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Chunk Count</Typography>
                    <Typography variant="h6" color="info.main">
                      {streamContentQuery.data.chunks}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">chunks</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2">Status</Typography>
                    <Chip
                      label={streamContentQuery.data.meta.status}
                      color={streamContentQuery.data.meta.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}; 