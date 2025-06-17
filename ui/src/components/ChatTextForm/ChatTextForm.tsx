import { CircularProgress } from "@mui/material";
import { IconButton } from "@mui/material";
import { Box } from "@mui/material";
import { ChatTextField } from "../ChatTextField/ChatTextField";
import { useState, useEffect } from "react";
import { trpc } from "../../services/trpc";
import { useNotify } from "../../providers/NotificationProdiver/useNotify";
import { type MessageType as ServerMessageType } from "../../../../server/src/router/messageRouter";

type MessageType = Omit<ServerMessageType, "createdAt"> & {
  createdAt: string;
};

type StreamChunk =
  | { type: "aiMessageStart"; message: MessageType }
  | {
      type: "aiMessageChunk";
      messageId: string;
      chunk: string;
      fullContent: string;
    }
  | { type: "aiMessageComplete"; message: MessageType };

export const ChatTextForm = ({
  placeholder,
  chatId,
  // modelId,
  onMessageSent,
  onNewMessages,
  onStreamingUpdate,
}: {
  placeholder?: string;
  chatId?: string;
  // modelId?: string;
  onMessageSent?: () => void;
  onNewMessages?: (messages: MessageType[]) => void;
  onStreamingUpdate?: (chunk: StreamChunk) => void;
}) => {
  const [question, setQuestion] = useState("");
  const [currentUserMessageId, setCurrentUserMessageId] = useState<
    string | null
  >(null);
  const { error } = useNotify();
  const { data: selectedModel } = trpc.model.getSelection.useQuery({ chatId });
  const modelId = selectedModel?.selected?.id;

  const { mutate: sendMessage, isPending: isLoading } =
    trpc.message.send.useMutation({
      onSuccess: async (res) => {
        setQuestion("");

        // Add the user message to the cache immediately
        if (onNewMessages) {
          onNewMessages([res.userMessage] as MessageType[]);
        }

        // Set the user message ID to trigger streaming
        if (res.userMessage?.id) {
          setCurrentUserMessageId(res.userMessage.id);
        }

        onMessageSent?.();
      },
      onError: (err) => {
        error(`Failed to send message: ${err.message}`);
      },
    });

  // Streaming query for AI response
  const streamingQuery = trpc.message.streamAIResponse.useQuery(
    {
      chatId: chatId!,
      userMessageId: currentUserMessageId!,
      modelId: modelId,
    },
    {
      enabled: !!chatId && !!currentUserMessageId,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );

  // Handle streaming data updates
  useEffect(() => {
    if (streamingQuery.data && onStreamingUpdate) {
      // streamingQuery.data is an array of chunks that grows as the stream progresses
      const chunks = streamingQuery.data;
      if (chunks.length > 0) {
        // Process the latest chunk
        const latestChunk = chunks[chunks.length - 1];
        onStreamingUpdate(latestChunk);
      }
    }
  }, [streamingQuery.data, onStreamingUpdate]);

  // Reset streaming state when query completes
  useEffect(() => {
    if (streamingQuery.fetchStatus === "idle" && currentUserMessageId) {
      setCurrentUserMessageId(null);
    }
  }, [streamingQuery.fetchStatus, currentUserMessageId]);

  // Handle streaming errors
  useEffect(() => {
    if (streamingQuery.error) {
      error(`Failed to stream AI response: ${streamingQuery.error.message}`);
      setCurrentUserMessageId(null);
    }
  }, [streamingQuery.error, error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isLoading) {
      sendMessage({
        content: question.trim(),
        chatId: chatId,
      });
    }
  };

  return (
    <Box
      sx={{
        p: 1,
        display: "flex",
        alignItems: "center",
        width: "100%",
        background: (theme) => theme.palette.background.paper,
        borderRadius: "4px",
      }}
      component="form"
      onSubmit={handleSubmit}
    >
      <ChatTextField
        onChange={setQuestion}
        value={question}
        disabled={isLoading}
        placeholder={placeholder}
      />
      {/* <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" /> */}
      <IconButton
        type="submit"
        color="primary"
        disabled={isLoading || !question.trim()}
        sx={{ p: "10px", "&:focus": { color: "text.primary" }, height: 28 }}
        aria-label="send message"
      >
        {isLoading ? <CircularProgress size={20} color="inherit" /> : "→"}
      </IconButton>
    </Box>
  );
};
