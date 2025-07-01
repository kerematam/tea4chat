/**
 * Message Chunk-based BullMQ Stream Test using MessageType Structure
 *
 * This component demonstrates streaming with BullMQ using the MessageType structure
 * from messageRouter.ts for message chunk streaming similar to sendWithStream.
 */

import {
  Analytics,
  Chat,
  CloudQueue,
  Delete,
  Person,
  PlayArrow,
  Send,
  SmartToy,
  Stop,
  Timer,
  Work,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
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

// MessageType from messageRouter.ts
interface MessageType {
  id: string;
  createdAt: Date;
  chatId: string;
  content: string;
  from: string;
  text: string;
}

// Server response format (what we get from tRPC)
interface ServerMessageType {
  id: string;
  createdAt: string; // Server sends as string
  chatId: string;
  content: string;
  from: string;
  text: string;
}

// StreamMessage type similar to sendWithStream
type StreamMessage = {
  type: "userMessage" | "aiMessageStart" | "aiMessageChunk" | "aiMessageComplete";
  message?: ServerMessageType;
  messageId?: string;
  chunk?: string;
  chunkId?: string;
  chatId: string;
};

// Helper function to convert server response to proper MessageType
const convertToMessageType = (serverMessage: ServerMessageType): MessageType => ({
  ...serverMessage,
  createdAt: new Date(serverMessage.createdAt)
});

// Queue metrics interface
interface MessageChunkStreamMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  paused: number;
  activeStreams: { streamId: string; chatId: string; jobId: string }[];
}

const StreamTestMessage: React.FC = () => {
  // Stream state
  const [streamId, setStreamId] = useState<string>("");
  const [chatId, setChatId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<MessageType[]>([]);

  const [currentAiMessageId, setCurrentAiMessageId] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Configuration
  const [streamType, setStreamType] = useState<"demo" | "ai" | "conversation">("ai");
  const [userContent, setUserContent] = useState<string>("How does artificial intelligence work?");
  const [intervalMs, setIntervalMs] = useState(200);
  const [maxChunks, setMaxChunks] = useState(15);

  // Metrics
  const [metrics, setMetrics] = useState<MessageChunkStreamMetrics | null>(null);

  // Progress tracking
  const [streamStartTime, setStreamStartTime] = useState<Date | null>(null);
  const [streamEndTime, setStreamEndTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // tRPC mutations and queries
  const startStreamMutation = trpc.messageStream.startMessageChunkStream.useMutation({
    onSuccess: (data) => {
      console.log("✅ Message chunk stream started:", data);
      setStreamId(data.streamId);
      setChatId(data.chatId);
      setIsStreaming(true);
      setError(null);
      setStreamStartTime(new Date());
      setStreamEndTime(null);
      setElapsedTime(0);
      setIsListening(true);
      setCurrentAiMessageId(null);

      // Start listening to the stream
      listenToStreamMutation.mutate({ streamId: data.streamId });
    },
    onError: (error) => {
      console.error("❌ Failed to start message chunk stream:", error);
      setError(error.message);
      setIsStreaming(false);
    },
  });

  const stopStreamMutation = trpc.messageStream.stopMessageChunkStream.useMutation({
    onSuccess: () => {
      console.log("🛑 Message chunk stream stopped");
      setIsStreaming(false);
      setStreamEndTime(new Date());
      setIsListening(false);
    },
    onError: (error) => {
      console.error("❌ Failed to stop message chunk stream:", error);
      setError(error.message);
    },
  });

  // Listen to stream mutation - follows exact sendWithStream pattern
  const listenToStreamMutation = trpc.messageStream.listenToMessageChunkStream.useMutation({
    onSuccess: async (streamGenerator) => {
      try {
        for await (const event of streamGenerator) {
          console.log(`📨 Received message chunk stream event:`, event);

          // Add event to display
          setStreamEvents((prev) => [...prev, event]);

          // Handle different event types like sendWithStream
          switch (event.type) {
            case "userMessage":
              if (event.message) {
                setMessages((prev) => [...prev, convertToMessageType(event.message)]);
              }
              break;

            case "aiMessageStart":
              if (event.message) {
                const convertedMessage = convertToMessageType(event.message);
                setMessages((prev) => [...prev, convertedMessage]);
                setCurrentAiMessageId(convertedMessage.id);
              }
              break;

            case "aiMessageChunk":
              if (event.chunk && event.messageId) {
                const chunk = event.chunk;
                // Update the AI message in the messages array with accumulated content
                setMessages((msgs) => 
                  msgs.map((msg) => 
                    msg.id === event.messageId 
                      ? { ...msg, content: msg.content + chunk, text: msg.text + chunk }
                      : msg
                  )
                );
              }
              break;

            case "aiMessageComplete":
              if (event.message) {
                const convertedMessage = convertToMessageType(event.message);
                // Replace the AI message with the complete version
                setMessages((prev) => 
                  prev.map((msg) => 
                    msg.id === convertedMessage.id ? convertedMessage : msg
                  )
                );
                setCurrentAiMessageId(null);
                setIsStreaming(false);
                setStreamEndTime(new Date());
                setIsListening(false);

                // Refetch metrics
                getMetricsQuery.refetch();
              }
              break;
          }
        }
      } catch (err) {
        console.error("Message chunk stream processing error:", err);
        setError(`Failed to process stream: ${(err as Error).message}`);
        setIsListening(false);
        setIsStreaming(false);
      }
    },
    onError: (err) => {
      console.error("❌ Failed to listen to message chunk stream:", err);
      setError(`Failed to listen to stream: ${err.message}`);
      setIsListening(false);
      setIsStreaming(false);
    },
  });

  const getMetricsQuery = trpc.messageStream.getMessageChunkStreamMetrics.useQuery(
    undefined,
    {
      // refetchInterval: 5000,
    }
  );

  const getActiveStreamsQuery = trpc.messageStream.getActiveMessageChunkStreams.useQuery(
    undefined,
    {
      // refetchInterval: 3000,
    }
  );

  // Timer effect
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
    if (!userContent.trim()) {
      setError("Please enter a user message");
      return;
    }

    setMessages([]);
    setStreamEvents([]);
    setError(null);
    startStreamMutation.mutate({
      chatId: chatId || undefined,
      userContent: userContent.trim(),
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
      console.log("🎧 Starting to listen to existing message chunk stream:", streamId);
      setMessages([]);
      setStreamEvents([]);
      setError(null);
      setIsListening(true);
      setIsStreaming(false);
      setCurrentAiMessageId(null);

      listenToStreamMutation.mutate({ streamId });
    }
  };

  const handleStopListening = () => {
    console.log("🔇 Stopped listening to message chunk stream:", streamId);
    setIsListening(false);
  };

  const handleTestReplay = () => {
    if (streamId) {
      console.log("🔄 Testing message chunk stream replay functionality...");
      setMessages([]);
      setStreamEvents([]);
      setError(null);
      setIsListening(true);
      setStreamingContent("");
      setCurrentAiMessageId(null);

      listenToStreamMutation.mutate({ streamId });
    }
  };

  const handleClearLogs = () => {
    setMessages([]);
    setStreamEvents([]);
    setError(null);
    setStreamingContent("");
    setCurrentAiMessageId(null);
  };

  const formatTimestamp = (timestamp: string | Date) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString();
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

  // Calculate progress from chunks received
  const chunksReceived = streamEvents.filter(e => e.type === "aiMessageChunk").length;
  const progressPercentage = 
    maxChunks > 0 ? Math.round((chunksReceived / maxChunks) * 100) : 0;

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
              Message Chunk Streaming Test (BullMQ)
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              <strong>Chunk-based Streaming:</strong> Similar to sendWithStream pattern.
              Yields userMessage → aiMessageStart → aiMessageChunk(s) → aiMessageComplete
              <br />
              <strong>Cross-tab streaming:</strong> Copy a stream ID to listen 
              to the same message stream from multiple tabs!
            </Alert>

            <Stack spacing={3}>
              {/* User Content Input */}
              <TextField
                fullWidth
                label="User Message"
                value={userContent}
                onChange={(e) => setUserContent(e.target.value)}
                placeholder="Enter your message here..."
                variant="outlined"
                multiline
                rows={2}
                disabled={isStreaming}
                InputProps={{
                  endAdornment: (
                    <Send sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                }}
              />

              <Grid container spacing={2} alignItems="end">
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="Stream ID"
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    placeholder="Auto-generated on start"
                    variant="outlined"
                    size="small"
                    InputProps={{
                      sx: { fontFamily: "monospace", fontSize: "0.875rem" },
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="Chat ID"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="Auto-generated on start"
                    variant="outlined"
                    size="small"
                    InputProps={{
                      sx: { fontFamily: "monospace", fontSize: "0.875rem" },
                    }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    label="Interval (ms)"
                    type="number"
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                    inputProps={{ min: 100, max: 2000 }}
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
                    inputProps={{ min: 5, max: 30 }}
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
                          e.target.value as "demo" | "ai" | "conversation"
                        )
                      }
                      label="Stream Type"
                      disabled={isStreaming}
                    >
                      <MenuItem value="demo">Demo</MenuItem>
                      <MenuItem value="ai">AI Response</MenuItem>
                      <MenuItem value="conversation">Conversation</MenuItem>
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
                  disabled={isStreaming || startStreamMutation.isPending || !userContent.trim()}
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
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: isStreaming
                            ? "#4caf50"
                            : isListening
                            ? "#2196f3"
                            : "#9e9e9e",
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
                  {chatId && (
                    <Chip
                      icon={<Chat />}
                      label={`Chat: ${chatId.slice(-12)}`}
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
                    label={`Chunks: ${chunksReceived}/${maxChunks}`}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>

                {/* Progress Bar */}
                {streamStartTime && (
                  <Box>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Progress: {chunksReceived} / {maxChunks} chunks
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

        {/* Chat Messages Display - Similar to sendWithStream UI */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Chat Messages ({messages.length})
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 400,
                maxHeight: 500,
                overflow: "auto",
                bgcolor: "grey.50",
              }}
            >
              {messages.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                  No messages yet...
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {messages.map((message) => (
                    <Box
                      key={message.id}
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        flexDirection: message.from === "user" ? "row-reverse" : "row",
                        gap: 1,
                      }}
                    >
                      <Avatar
                        sx={{
                          bgcolor: message.from === "user" ? "primary.main" : "secondary.main",
                          width: 32,
                          height: 32,
                        }}
                      >
                        {message.from === "user" ? <Person fontSize="small" /> : <SmartToy fontSize="small" />}
                      </Avatar>
                      <Paper
                        elevation={1}
                        sx={{
                          p: 1.5,
                          maxWidth: "80%",
                          bgcolor: message.from === "user" ? "primary.light" : "grey.100",
                          color: message.from === "user" ? "primary.contrastText" : "text.primary",
                          position: "relative",
                        }}
                      >
                        <Typography variant="body2" sx={{ mb: 0.5, whiteSpace: "pre-wrap" }}>
                          {message.content}
                          {/* Show typing indicator for streaming AI message */}
                          {message.id === currentAiMessageId && isStreaming && (
                            <span style={{ color: '#1976d2', fontWeight: 'bold' }}>▌</span>
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(message.createdAt)} • {message.from}
                          {message.id === currentAiMessageId && isStreaming && (
                            <span style={{ marginLeft: 8, color: '#1976d2' }}>streaming...</span>
                          )}
                        </Typography>
                      </Paper>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </CardContent>
        </Card>

        {/* Stream Events Log */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stream Events ({streamEvents.length})
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: "auto" }}>
              <Stack spacing={1}>
                {streamEvents.map((event, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor:
                        event.type === "userMessage"
                          ? "info.light"
                          : event.type === "aiMessageStart"
                          ? "warning.light"
                          : event.type === "aiMessageChunk"
                          ? "grey.100"
                          : "success.light",
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={event.type}
                          size="small"
                          color={
                            event.type === "userMessage"
                              ? "info"
                              : event.type === "aiMessageStart"
                              ? "warning"
                              : event.type === "aiMessageChunk"
                              ? "default"
                              : "success"
                          }
                        />
                        {event.chunk && (
                          <Chip
                            label={`"${event.chunk.slice(0, 30)}${event.chunk.length > 30 ? '...' : ''}"`}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: "monospace" }}
                          />
                        )}
                        {event.chunkId && (
                          <Chip
                            label={event.chunkId}
                            size="small"
                            color="secondary"
                            variant="outlined"
                            sx={{ fontFamily: "monospace" }}
                          />
                        )}
                        {event.message && (
                          <Chip
                            label={`${event.message.from}: ${event.message.content.slice(0, 20)}...`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        #{index + 1}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
                {streamEvents.length === 0 && (
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

        {/* Queue Metrics Dashboard */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <CloudQueue sx={{ mr: 1, verticalAlign: "middle" }} />
              Message Chunk Stream Queue Metrics
            </Typography>
            {metrics ? (
              <Grid container spacing={2}>
                <Grid item xs={6} md={2}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Waiting</Typography>
                    <Typography variant="h6" color="warning.main">
                      {metrics.waiting}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={2}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Active</Typography>
                    <Typography variant="h6" color="success.main">
                      {metrics.active}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={2}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Completed</Typography>
                    <Typography variant="h6" color="info.main">
                      {metrics.completed}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={2}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Failed</Typography>
                    <Typography variant="h6" color="error.main">
                      {metrics.failed}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={2}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="subtitle2">Paused</Typography>
                    <Typography variant="h6" color="warning.main">
                      {metrics.paused}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={2}>
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
                Loading message chunk stream metrics...
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Active Streams Status */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Message Chunk Streams
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
                                flexWrap="wrap"
                              >
                                <Chip
                                  label={stream.streamId}
                                  size="small"
                                  sx={{ fontFamily: "monospace" }}
                                />
                                <Chip
                                  label={`Chat: ${stream.chatId}`}
                                  size="small"
                                  variant="outlined"
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

export default StreamTestMessage;