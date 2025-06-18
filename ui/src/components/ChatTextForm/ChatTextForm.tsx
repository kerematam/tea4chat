import { CircularProgress } from "@mui/material";
import { IconButton } from "@mui/material";
import { Box } from "@mui/material";
import { ChatTextField } from "../ChatTextField/ChatTextField";
import { useState } from "react";
import { trpc } from "../../services/trpc";
import { useNotify } from "../../providers/NotificationProdiver/useNotify";
import { type MessageType as ServerMessageType } from "../../../../server/src/router/messageRouter";

type MessageType = Omit<ServerMessageType, "createdAt"> & {
  createdAt: string;
};

type StreamChunk =
  | { type: "userMessage"; message: MessageType; chatId: string }
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
  onMessageSent,
  onStreamingUpdate,
}: {
  placeholder?: string;
  chatId?: string;
  onMessageSent?: () => void;
  onStreamingUpdate?: (chunk: StreamChunk) => void;
}) => {
  const [question, setQuestion] = useState("");
  const { error } = useNotify();
  const { data: selectedModel } = trpc.model.getSelection.useQuery({ chatId });
  const modelId = selectedModel?.selected?.id;

  const { mutate: sendWithStream, isPending: isLoading } =
    trpc.message.sendWithStream.useMutation({
      onSuccess: async (streamGenerator) => {
        setQuestion("");
        onMessageSent?.();

        // Process the stream
        try {
          for await (const chunk of streamGenerator) {
            if (onStreamingUpdate) {
              onStreamingUpdate(chunk);
            }
          }
        } catch (err) {
          console.error("Stream processing error:", err);
          error(`Failed to process stream: ${(err as Error).message}`);
        }
      },
      onError: (err) => {
        error(`Failed to send message: ${err.message}`);
      },
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isLoading) {
      sendWithStream({
        content: question.trim(),
        chatId: chatId,
        modelId: modelId,
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
