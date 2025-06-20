import { Box, Container, Fab, Typography, Paper } from "@mui/material";
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import { ChatTextForm } from "../../components/ChatTextForm/ChatTextForm";
import AgentMessage from "./components/AgentMessage/AgentMessage";
import ModelSelector from "./components/ModelSelector/ModelSelector";
import { useLocation } from "react-router-dom";

import { useChatMessages, MessageType } from "../../hooks/useChatMessages";
import Landing from "./components/Landing/Landing";

export type SqlTable = {
  columns: string[];
  rows: Record<string, unknown>[];
};

const useMessagesGrouping = (messages: MessageType[]) => {
  const lastUserMessage = messages.findLast(
    (message) => message.from === "user"
  );
  const lastUserIndex = lastUserMessage
    ? messages.lastIndexOf(lastUserMessage)
    : -1;
  const prevMessages =
    lastUserIndex >= 0 ? messages.slice(0, lastUserIndex) : messages;
  const newMessages = lastUserIndex >= 0 ? messages.slice(lastUserIndex) : [];
  return [prevMessages, newMessages];
};

const Chat = () => {
  const location = useLocation();
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Intersection observer for loading more messages - placed at the end of older messages
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "50px",
  });

  // Use our custom hook for all chat functionality
  const {
    messages: allMessages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    sendMessage,
    isSending,
  } = useChatMessages({
    chatId,
    onChatCreated: ({ chatId }: { chatId: string }) => {
      navigate(`/chat/${chatId}`, { replace: true });
    },
  });

  // Load older messages when intersection observer is triggered
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [prevMessages, newMessages] = useMessagesGrouping(allMessages);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Handle scroll events for showing/hiding scroll button
  useEffect(() => {
    const container = containerRef.current;
    const handleScroll = () => {
      if (!container) return;

      // In column-reverse, scrollTop > 0 means user scrolled up from bottom
      const isNotAtBottom = container.scrollTop > 100;
      setShowScrollButton(isNotAtBottom);
    };

    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, []);

  if (location.pathname === "/") {
    return <Landing onSendMessage={sendMessage} isSending={isSending} />;
  }

  // Show new chat interface when no chatId
  if (!chatId) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 130px)",
          position: "relative",
        }}
      >
        <Container
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            pb: 10,
          }}
        >
          <Paper
            sx={{
              p: 4,
              textAlign: "center",
              maxWidth: 400,
              width: "100%",
            }}
          >
            <Typography variant="h5" component="h1" gutterBottom>
              Start a New Chat
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Type your first message below to begin a new conversation.
            </Typography>
          </Paper>
        </Container>

        {/* Chat input for new chat */}
        <Box
          sx={{
            position: "sticky",
            bottom: 0,
            bgcolor: "background.default",
            p: 2,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <ChatTextForm
            placeholder="Start a new conversation..."
            chatId={chatId} // Will be undefined for new chat
          />
          {/* ModelSelector only shown after chat is created */}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <div>
        Error:{" "}
        {(error as { message?: string })?.message || "Failed to load messages"}
      </div>
    );
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const renderMessages = (messagesToRender: MessageType[]) => {
    return messagesToRender.map((message) => (
      <Box key={message.id}>
        <Box
          sx={{
            display: "flex",
            justifyContent: message.from === "user" ? "flex-end" : "flex-start",
            mb: 2,
          }}
        >
          {message.from === "user" ? (
            <Box
              sx={{
                height: "100%",
                maxWidth: "70%",
                p: 2,
                borderRadius: 2,
                bgcolor: "background.paper",
                border: (theme) =>
                  theme.palette.mode === "light" ? "2px solid" : "none",
                borderColor: (theme) =>
                  theme.palette.mode === "light" ? "divider" : "transparent",
              }}
            >
              {message.content}
            </Box>
          ) : (
            <Box sx={{ width: "100%" }}>
              <AgentMessage message={message} />
            </Box>
          )}
        </Box>
      </Box>
    ));
  };

  return (
    <Box
      id="chat-container"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 130px)",
        position: "relative",
      }}
    >
      <Container
        ref={containerRef}
        sx={{
          mb: 2,
          flex: 1,
          pb: 10,
          minHeight: 0,
          overflow: "auto",
          overflowAnchor: "auto !important",
          display: "flex",
          flexDirection: "column-reverse",
          "&::-webkit-scrollbar": { width: "8px" },
          "&::-webkit-scrollbar-track": {
            background: "action.hover",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "divider",
            borderRadius: "4px",
            "&:hover": {
              background: "text.secondary",
            },
          },
        }}
      >
        {/* Bottom reference for scroll to bottom */}
        <Box ref={bottomRef} />

        {/* New messages section */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {renderMessages(newMessages)}
        </Box>

        {/* Previous messages section */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {renderMessages(prevMessages)}
        </Box>

        {/* Load more messages trigger */}
        {hasNextPage && (
          <Box
            ref={loadMoreRef}
            sx={{
              py: 2,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            {isFetchingNextPage ? "Loading older messages..." : ""}
          </Box>
        )}
      </Container>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <Fab
          size="small"
          color="primary"
          onClick={scrollToBottom}
          sx={{
            position: "absolute",
            bottom: 120,
            right: 16,
            zIndex: 1000,
          }}
        >
          <KeyboardArrowDownIcon />
        </Fab>
      )}

      {/* Chat input and model selector */}
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          bgcolor: "background.default",
          p: 2,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <ChatTextForm
          placeholder="Type your message here..."
          chatId={chatId}
          // onStreamingUpdate={handleStreamingUpdate}
        />
        {chatId && <ModelSelector chatId={chatId} />}
      </Box>
    </Box>
  );
};

export default Chat;
