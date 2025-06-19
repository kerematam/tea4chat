import { CircularProgress } from "@mui/material";
import { IconButton } from "@mui/material";
import { Box } from "@mui/material";
import { ChatTextField } from "../ChatTextField/ChatTextField";
import { useState } from "react";
import { trpc } from "../../services/trpc";
import { MessageType, useChatMessages } from "../../hooks/useChatMessages";

import SendIcon from "@mui/icons-material/Send";
import { useNavigate } from "react-router-dom";

export const ChatTextForm = ({
  placeholder,
  chatId,
}: {
  placeholder?: string;
  chatId?: string;
}) => {
  const [question, setQuestion] = useState("");
  const { data: selectedModel } = trpc.model.getSelection.useQuery({ chatId });
  const modelId = selectedModel?.selected?.id;
  const navigate = useNavigate();
  const hookResult = useChatMessages({
    chatId: chatId!,
    chunkHandlers: {
      userMessage: (message: MessageType) => {
        setQuestion("");
      },
    },
    onChatCreated: ({ chatId }: { chatId: string }) => {
      navigate(`/chat/${chatId}`, { replace: true });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !hookResult.isSending) {
      hookResult.sendMessage(question.trim(), modelId);
    }
  };

  const currentIsLoading = hookResult.isSending;

  return (
    <Box
      sx={{
        p: 1,
        display: "flex",
        alignItems: "center",
        width: "100%",
        border: (theme) =>
          theme.palette.mode === "light"
            ? `2px solid ${theme.palette.divider}`
            : "none",
        background: (theme) => theme.palette.background.paper,
        borderRadius: "4px",
      }}
      component="form"
      onSubmit={handleSubmit}
    >
      <ChatTextField
        onChange={setQuestion}
        value={question}
        disabled={currentIsLoading}
        placeholder={placeholder}
      />
      <IconButton
        type="submit"
        color="primary"
        disabled={currentIsLoading || !question.trim()}
        sx={{
          p: "10px",
          "&:focus": { color: "text.primary" },
          alignSelf: "flex-end",
          minHeight: 28,
        }}
        aria-label="send message"
      >
        {currentIsLoading ? (
          <CircularProgress size={20} color="inherit" />
        ) : (
          <SendIcon sx={{ fontSize: 20 }} />
        )}
      </IconButton>
    </Box>
  );
};
