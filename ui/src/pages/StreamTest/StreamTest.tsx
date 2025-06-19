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
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Headphones,
  Circle,
} from '@mui/icons-material';
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
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* Header and Controls */}
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom>
              Redis Stream Test
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              Traditional approach with state accumulation. Each chunk grows the content string.
            </Alert>
            
            <Stack spacing={3}>
              <Grid container spacing={2} alignItems="end">
                <Grid item xs={12} md={6}>
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
              </Grid>

              <Stack direction="row" spacing={1} flexWrap="wrap">
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
                  disabled={!streamId || !isStreaming || manageStreamMutation.isPending}
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
                  onClick={startListening}
                  disabled={!streamId || listenToStreamMutation.isPending}
                >
                  {listenToStreamMutation.isPending ? 'Listening...' : 'Listen to Stream'}
                </Button>
              </Stack>

              {/* Status */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <Chip
                  icon={<Circle sx={{ color: isStreaming ? 'success.main' : 'grey.400' }} />}
                  label={isStreaming ? 'Streaming...' : 'Stopped'}
                  color={isStreaming ? 'success' : 'default'}
                  variant="outlined"
                />
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

        {/* Stream Events Log */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stream Events ({streamChunks.length})
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Stack spacing={1}>
                {streamChunks.slice(-20).map((chunk, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor: chunk.type === 'start' ? 'info.light' :
                              chunk.type === 'chunk' ? 'grey.100' :
                              chunk.type === 'complete' ? 'success.light' : 'error.light',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Chip
                        label={chunk.type}
                        size="small"
                        color={chunk.type === 'start' ? 'info' :
                               chunk.type === 'chunk' ? 'default' :
                               chunk.type === 'complete' ? 'success' : 'error'}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(chunk.timestamp)}
                      </Typography>
                    </Stack>
                    {chunk.content && (
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
                        "{chunk.content}"
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

        {/* Active Streams */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Streams ({activeStreamsQuery.data?.count || 0})
            </Typography>
            <Stack spacing={1}>
              {activeStreamsQuery.data?.activeStreams.map((stream) => (
                <Paper key={stream.streamId} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" component="div" fontFamily="monospace" color="text.secondary">
                        {stream.streamId}
                      </Typography>
                      <Typography variant="body2">
                        Status: {stream.status}
                      </Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="caption" color="text.secondary">
                        Started: {stream.startedAt && formatTimestamp(stream.startedAt)}
                      </Typography>
                      {stream.updatedAt && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Updated: {formatTimestamp(stream.updatedAt)}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Paper>
              ))}
              {(!activeStreamsQuery.data?.activeStreams.length) && (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                  No active streams
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}; 