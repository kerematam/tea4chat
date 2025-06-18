import {
  Box,
  Container,
  Typography,
  List,
  ListItemIcon,
  Collapse,
  ListItemButton,
} from "@mui/material";
import logo from "../../assets/tea4chat.png";

import { useState } from "react";
import ChatCreateForm from "../../components/ChatCreateForm/ChatCreateForm";
import { trpc } from "../../services/trpc";

export default function Home({
  onSendMessage,
  isSending,
}: {
  onSendMessage: (content: string, modelId?: string) => void;
  isSending: boolean;
}) {
  const { data: selectedModel } = trpc.model.getSelection.useQuery({
    chatId: undefined,
  });
  const modelId = selectedModel?.selected?.id;
  const [question, setQuestion] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      onSendMessage(question.trim(), modelId);
      setQuestion("");
    }
  };

  const handleSuggestionClick = (questionText: string) => {
    setQuestion(questionText);
    onSendMessage(question.trim(), modelId);
  };

  return (
    <>
      <Box
        sx={{ color: "white", py: 4, display: "flex", alignItems: "center" }}
      >
        <Container maxWidth="sm">
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              mb: 2,
              background: "transparent",
            }}
          >
            <Box sx={{ background: "transparent" }}>
              <img
                src={logo}
                alt="Tea 4 Chat"
                // fetchPriority="high"
                style={{
                  width: "100%",
                  maxWidth: "300px",
                }}
              />
            </Box>
          </Box>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              mb: 3,
              textAlign: "center",
              fontFamily: "Jura, sans-serif",
              fontWeight: "bold",
              color: "text.secondary",
              fontSize: "2.5rem",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.1)",
            }}
          >
            Tea 4 Chat
          </Typography>

          <Box
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setIsFocused(false);
              }
            }}
          >
            <ChatCreateForm
              question={question}
              setQuestion={setQuestion}
              isLoading={isSending}
              handleSubmit={handleSubmit}
            />
            <Collapse in={isFocused}>
              <List sx={{ mt: 1 }}>
                {[
                  "How does AI work?",
                  "Are black holes real?",
                  "How many Rs are in the word strawberry?",
                  "What is the meaning of life?",
                ].map((questionText, idx) => (
                  <ListItemButton
                    key={idx}
                    sx={{
                      justifyContent: "flex-start",
                      color: "text.secondary",
                      textTransform: "none",
                      mb: 1,
                    }}
                    onClick={() => {
                      handleSuggestionClick(questionText);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: "36px" }}>→</ListItemIcon>
                    {questionText}
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </Box>
        </Container>
      </Box>
    </>
  );
}
