/**
 * Native BullMQ Stream Test using Built-in Progress and Events
 *
 * This component demonstrates streaming with BullMQ's native job.progress
 * and QueueEvents.on('progress') for historical replay and real-time streaming.
 */

import {
  Analytics,
  Circle,
  CloudQueue,
  Delete,
  PlayArrow,
  Stop,
  Timer,
  Work,
} from "@mui/icons-material";
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
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { trpc } from "../../services/trpc";

interface StreamChunk {
  type: "start" | "chunk" | "complete" | "error";
  streamId: string;
  chunkNumber: number;
  content?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface NativeQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  activeStreams: { streamId: string; jobId: string }[];
}

const StreamTestNative: React.FC = () => {
  // Stream state
  const [streamId, setStreamId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamChunks, setStreamChunks] = useState<StreamChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Configuration
  const [streamType, setStreamType] = useState<"demo" | "ai" | "custom">(
    "demo"
  );
  const [intervalMs, setIntervalMs] = useState(100);
  const [maxChunks, setMaxChunks] = useState(100);

  // Metrics
  const [metrics, setMetrics] = useState<NativeQueueMetrics | null>(null);

  // Progress tracking
  const [streamStartTime, setStreamStartTime] = useState<Date | null>(null);
  const [streamEndTime, setStreamEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // tRPC mutations and queries
  const startStreamMutation = trpc.native.startStream.useMutation({
    onSuccess: (data) => {
      console.log("✅ Native stream started:", data);
      setStreamId(data.streamId);
      setIsStreaming(true);
      setError(null);
      setStreamStartTime(new Date());
      setStreamEndTime(null);
      setElapsedTime(0);
      setIsListening(true); // Start listening immediately

      // Start listening to the stream using the same pattern
      listenToStreamMutation.mutate({ streamId: data.streamId });
    },
    onError: (error) => {
      console.error("❌ Failed to start native stream:", error);
      setError(error.message);
      setIsStreaming(false);
    },
  });

  const stopStreamMutation = trpc.native.stopStream.useMutation({
    onSuccess: () => {
      console.log("🛑 Native stream stopped");
      setIsStreaming(false);
      setStreamEndTime(new Date());
      setIsListening(false); // Stop listening
    },
    onError: (error) => {
      console.error("❌ Failed to stop native stream:", error);
      setError(error.message);
    },
  });

  // Listen to stream mutation - follows exact sendWithStream pattern
  const listenToStreamMutation = trpc.native.listenToStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the stream exactly like sendWithStream
      try {
        for await (const chunk of streamGenerator) {
          console.log(`📨 Received native chunk:`, chunk);

          // Add chunk to display (keep last 20 chunks)
          setStreamChunks((prev) => [...prev, chunk]);

          // Check if stream completed
          if (chunk.type === "complete" || chunk.type === "error") {
            setIsStreaming(false);
            setStreamEndTime(new Date());
            setIsListening(false);

            // Refetch metrics on completion
            getMetricsQuery.refetch();

            if (chunk.type === "error") {
              setError("Stream completed with error");
            }
          }
        }
      } catch (err) {
        console.error("Native stream processing error:", err);
        setError(`Failed to process stream: ${(err as Error).message}`);
        setIsListening(false);
      }
    },
    onError: (err) => {
      console.error("❌ Failed to listen to native stream:", err);
      setError(`Failed to listen to stream: ${err.message}`);
      setIsListening(false);
    },
  });

  const getMetricsQuery = trpc.native.getMetrics.useQuery(undefined, {
    // refetchInterval: 5000,
  });

  const getActiveStreamsQuery = trpc.native.getActiveStreams.useQuery(
    undefined,
    {
      // refetchInterval: 3000,
    }
  );

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

  // Handlers
  const handleStartStream = () => {
    setStreamChunks([]);
    setError(null);
    startStreamMutation.mutate({
      type: streamType,
      intervalMs,
      maxChunks,
    });
  };

  const handleStopStream = () => {
    if (streamId) {
      stopStreamMutation.mutate({ streamId });
    }
  };

  const handleListenToStream = () => {
    if (streamId) {
      console.log("🎧 Starting to listen to existing native stream:", streamId);
      setStreamChunks([]);
      setError(null);
      setIsListening(true);
      setIsStreaming(false); // We're just listening, not actively streaming

      // Use listenToStream mutation like sendWithStream pattern
      listenToStreamMutation.mutate({ streamId });
    }
  };

  const handleStopListening = () => {
    console.log("🔇 Stopped listening to native stream:", streamId);
    setIsListening(false);
  };

  const handleTestReplay = () => {
    if (streamId) {
      console.log("🔄 Testing native replay functionality...");
      setStreamChunks([]);
      setError(null);
      setIsListening(true);

      // Use listenToStream mutation for replay
      listenToStreamMutation.mutate({ streamId });
    }
  };

  const handleClearLogs = () => {
    setStreamChunks([]);
    setError(null);
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

  // Calculate progress from chunks
  const startChunk = streamChunks.find((c) => c.type === "start");
  const totalChunks = maxChunks;
  const currentChunk = streamChunks.filter((c) => c.type === "chunk").length;
  const progressPercentage =
    totalChunks > 0 ? Math.round((currentChunk / totalChunks) * 100) : 0;

  // Update metrics
  useEffect(() => {
    if (getMetricsQuery.data) {
      setMetrics(getMetricsQuery.data);
    }
  }, [getMetricsQuery.data]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* Header and Controls */}
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom>
              Native BullMQ Streaming Test
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              <strong>Native BullMQ APIs:</strong> Uses BullMQ's native
              job.progress property and QueueEvents.on('progress') for
              historical replay and real-time streaming.
              <br />
              <strong>Cross-tab listening:</strong> Copy a stream ID from one
              tab and paste it in another tab to listen to the same stream in
              real-time!
            </Alert>

            <Stack spacing={3}>
              <Grid container spacing={2} alignItems="end">
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Stream ID"
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    placeholder="Enter stream ID or auto-generated on start"
                    variant="outlined"
                    size="small"
                    InputProps={{
                      sx: { fontFamily: "monospace", fontSize: "0.875rem" },
                    }}
                    helperText="Enter a stream ID to listen to existing streams from other tabs"
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    label="Interval (ms)"
                    type="number"
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                    inputProps={{ min: 100, max: 10000 }}
                    variant="outlined"
                    size="small"
                    disabled={isStreaming}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    label="Max Chunks"
                    type="number"
                    value={maxChunks}
                    onChange={(e) => setMaxChunks(Number(e.target.value))}
                    inputProps={{ min: 1, max: 100 }}
                    variant="outlined"
                    size="small"
                    disabled={isStreaming}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Stream Type</InputLabel>
                    <Select
                      value={streamType}
                      onChange={(e) =>
                        setStreamType(
                          e.target.value as "demo" | "ai" | "custom"
                        )
                      }
                      label="Stream Type"
                      disabled={isStreaming}
                    >
                      <MenuItem value="demo">Demo</MenuItem>
                      <MenuItem value="ai">AI Simulation</MenuItem>
                      <MenuItem value="custom">Custom</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{ gap: 1 }}
              >
                <Button
                  variant="contained"
                  color="success"
                  startIcon={
                    startStreamMutation.isPending ? (
                      <CircularProgress size={16} />
                    ) : (
                      <PlayArrow />
                    )
                  }
                  onClick={handleStartStream}
                  disabled={isStreaming || startStreamMutation.isPending}
                >
                  {startStreamMutation.isPending
                    ? "Starting..."
                    : "Start Stream"}
                </Button>

                <Button
                  variant="contained"
                  color="error"
                  startIcon={<Stop />}
                  onClick={handleStopStream}
                  disabled={!streamId || !isStreaming}
                >
                  {stopStreamMutation.isPending ? "Stopping..." : "Stop Stream"}
                </Button>

                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CloudQueue />}
                  onClick={handleListenToStream}
                  disabled={!streamId || isListening || isStreaming}
                >
                  Listen to Stream
                </Button>

                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<Stop />}
                  onClick={handleStopListening}
                  disabled={!isListening}
                >
                  Stop Listening
                </Button>

                <Button
                  variant="contained"
                  color="info"
                  startIcon={<Analytics />}
                  onClick={handleTestReplay}
                  disabled={!streamId}
                >
                  Test Replay
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<Delete />}
                  onClick={handleClearLogs}
                >
                  Clear Logs
                </Button>
              </Stack>

              {/* Status and Progress */}
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  flexWrap="wrap"
                >
                  <Chip
                    icon={
                      <Circle
                        sx={{
                          color: isStreaming
                            ? "success.main"
                            : isListening
                            ? "info.main"
                            : "grey.400",
                        }}
                      />
                    }
                    label={
                      isStreaming
                        ? "Streaming..."
                        : isListening
                        ? "Listening..."
                        : "Stopped"
                    }
                    color={
                      isStreaming ? "success" : isListening ? "info" : "default"
                    }
                    variant="outlined"
                  />
                  {streamId && (
                    <Chip
                      icon={<Work />}
                      label={`Stream: ${streamId.slice(-12)}`}
                      variant="outlined"
                      sx={{ fontFamily: "monospace" }}
                    />
                  )}
                  {streamStartTime && (
                    <Chip
                      icon={<Timer />}
                      label={formatElapsedTime(getCurrentElapsedTime())}
                      color={streamEndTime ? "success" : "primary"}
                      variant="outlined"
                      sx={{ fontFamily: "monospace" }}
                    />
                  )}
                  <Chip
                    label={`Events: ${streamChunks.length}`}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>

                {/* Progress Bar */}
                {startChunk && (
                  <Box>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Progress: {currentChunk} / {totalChunks} chunks
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {progressPercentage}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={progressPercentage}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                )}

                {/* Error Display */}
                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stream Chunks
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 200,
                maxHeight: 400,
                overflow: "auto",
                bgcolor: "grey.50",
                fontFamily: "monospace",
                fontSize: "0.875rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {streamChunks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No content yet...
                </Typography>
              ) : (
                streamChunks.map((chunk, index) => (
                  <Typography key={index} sx={{ mb: 1 }} component="span">
                    {chunk.content}
                  </Typography>
                ))
              )}
            </Paper>
          </CardContent>
        </Card>

        {/* Stream Content */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stream Content ({streamChunks.filter((c) => c.content).length}{" "}
              chunks with content)
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 200,
                maxHeight: 400,
                overflow: "auto",
                bgcolor: "grey.50",
                fontFamily: "monospace",
                fontSize: "0.875rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {streamChunks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No content yet...
                </Typography>
              ) : (
                streamChunks
                  .filter((chunk) => chunk.content)
                  .map((chunk, index) => (
                    <Box key={index} sx={{ mb: 1 }}>
                      <Typography
                        component="span"
                        color="text.secondary"
                        sx={{ fontSize: "0.75rem" }}
                      >
                        [{formatTimestamp(chunk.timestamp)}] #
                        {chunk.chunkNumber}:{" "}
                      </Typography>
                      {chunk.content}
                    </Box>
                  ))
              )}
            </Paper>
          </CardContent>
        </Card>

        {/* Stream Event Log */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Events ({streamChunks.length}/20)
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: "auto" }}>
              <Stack spacing={1}>
                {streamChunks.map((chunk, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor:
                        chunk.type === "start"
                          ? "info.light"
                          : chunk.type === "chunk"
                          ? "grey.100"
                          : chunk.type === "complete"
                          ? "success.light"
                          : "error.light",
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={chunk.type}
                          size="small"
                          color={
                            chunk.type === "start"
                              ? "info"
                              : chunk.type === "chunk"
                              ? "default"
                              : chunk.type === "complete"
                              ? "success"
                              : "error"
                          }
                        />
                        <Chip
                          label={`#${chunk.chunkNumber}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: "monospace" }}
                        />
                      </Stack>
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
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          bgcolor: "background.paper",
                        }}
                      >
                        "{chunk.content}"
                      </Paper>
                    )}
                    {chunk.metadata && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1, display: "block" }}
                      >
                        {JSON.stringify(chunk.metadata)}
                      </Typography>
                    )}
                  </Paper>
                ))}
                {streamChunks.length === 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                    sx={{ py: 4 }}
                  >
                    No events yet...
                  </Typography>
                )}
              </Stack>
            </Box>
          </CardContent>
        </Card>

        {/* Native Queue Metrics Dashboard */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <CloudQueue sx={{ mr: 1, verticalAlign: "middle" }} />
              Native BullMQ Queue Metrics
            </Typography>
            {metrics ? (
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Waiting</Typography>
                    <Typography variant="h6" color="warning.main">
                      {metrics.waiting}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Active</Typography>
                    <Typography variant="h6" color="success.main">
                      {metrics.active}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Completed</Typography>
                    <Typography variant="h6" color="info.main">
                      {metrics.completed}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Active Streams</Typography>
                    <Typography variant="h6" color="primary.main">
                      {metrics.activeStreams.length}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                sx={{ py: 2 }}
              >
                Loading native queue metrics...
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Active Streams Status */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Native Streams
            </Typography>
            <Stack spacing={1}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Typography variant="subtitle2">
                    Active Streams: {metrics?.activeStreams.length || 0}
                  </Typography>

                  {metrics?.activeStreams &&
                    metrics.activeStreams.length > 0 && (
                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mb: 1 }}
                        >
                          Stream Details:
                        </Typography>
                        <Stack spacing={1}>
                          {metrics.activeStreams.map((stream) => (
                            <Paper
                              key={stream.streamId}
                              variant="outlined"
                              sx={{ p: 1.5 }}
                            >
                              <Stack
                                direction="row"
                                spacing={2}
                                alignItems="center"
                              >
                                <Chip
                                  label={stream.streamId}
                                  size="small"
                                  sx={{ fontFamily: "monospace" }}
                                />
                                <Chip
                                  label={`Job: ${stream.jobId.slice(-8)}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontFamily: "monospace" }}
                                />
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>
                    )}
                </Stack>
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

export default StreamTestNative;
