import { Box, IconButton } from "@mui/material";
import { useState } from "react";
import { trpc } from "../../services/trpc";
import { ChatTextField } from "../ChatTextField/ChatTextField";

import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";

export const ChatTextForm = ({
  placeholder,
  chatId,
  sendMessage,
  isSending,
  abortStream,
  overrideModelId,
}: {
  placeholder?: string;
  chatId?: string;
  sendMessage: (content: string, modelId?: string) => void;
  isSending: boolean;
  abortStream: () => void;
  overrideModelId?: string;
}) => {
  const [question, setQuestion] = useState("");
  const { data: selectedModel } = trpc.model.getSelection.useQuery({ chatId });
  const modelId = overrideModelId ?? selectedModel?.selected?.id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isSending) {
      sendMessage(question.trim(), modelId);
      setQuestion(""); // Clear the input after sending
    }
  };

  const handleAbort = () => {
    if (isSending && chatId) {
      abortStream();
    }
  };

  const currentIsLoading = isSending;

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
        type={currentIsLoading ? "button" : "submit"}
        color="primary"
        disabled={!currentIsLoading && !question.trim()}
        onClick={currentIsLoading ? handleAbort : undefined}
        sx={{
          p: "10px",
          "&:focus": { color: "text.primary" },
          alignSelf: "flex-end",
          minHeight: 28,
        }}
        aria-label={currentIsLoading ? "abort message" : "send message"}
      >
        {currentIsLoading ? (
          <StopIcon sx={{ fontSize: 20 }} />
        ) : (
          <SendIcon sx={{ fontSize: 20 }} />
        )}
      </IconButton>
    </Box>
  );
};
