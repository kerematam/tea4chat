import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, Container, Fab, Paper, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ChatTextForm } from "../../components/ChatTextForm/ChatTextForm";
import AgentMessage from "./components/AgentMessage/AgentMessage";
import ModelSelector from "./components/ModelSelector/ModelSelector";

import {
  MessageType,
  useChatMessages,
} from "../../hooks/useChatMessages/useChatMessages";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";

const Chat = () => {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const {
    messages: previousMessages,
    streamingMessage,
    isLoading,
    error,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
    sendMessage,
    abortStream,
    isStreamingActive,
    isListeningToStream,
    manualSync,
  } = useChatMessages({
    chatId,
    onChatCreated: ({ chatId }: { chatId: string }) => {
      navigate(`/chat/${chatId}`);
    },
  });

  // Infinite scroll for loading older messages
  const { triggerRef: loadMoreRef } = useInfiniteScroll({
    fetchMore: () => {
      fetchNextPage();
    },
    hasMore: hasNextPage,
    isFetching: isFetchingNextPage,
  });

  // Infinite scroll for loading newer messages
  const { triggerRef: loadNewerRef } = useInfiniteScroll({
    fetchMore: fetchPreviousPage,
    hasMore: hasPreviousPage,
    isFetching: isFetchingPreviousPage,
  });

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

  const [newChatModelId, setNewChatModelId] = useState<string | undefined>(
    undefined
  );

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
            sendMessage={sendMessage}
            isSending={isStreamingActive}
            abortStream={abortStream}
            overrideModelId={newChatModelId}
          />
          {/* ModelSelector available for new chat; local selection passed to first message */}
          <ModelSelector
            onLocalSelectionChange={(m) => setNewChatModelId(m?.id)}
          />
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
      <Box key={message.id} data-testid="message-pair">
        {/* User Message */}
        <Box
          data-testid="message"
          data-role="user"
          data-message-id={message.id}
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mb: 2,
          }}
        >
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
            {message.userContent}
          </Box>
        </Box>

        {/* Agent Message (only if response exists) */}
        {message.agentContent && (
          <Box
            data-testid="message"
            data-role="assistant"
            data-message-id={message.id}
            sx={{
              display: "flex",
              justifyContent: "flex-start",
              mb: 2,
            }}
          >
            <Box sx={{ width: "100%" }}>
              <AgentMessage message={message} />
            </Box>
          </Box>
        )}

        {/* Streaming indicator for incomplete messages */}
        {!message.agentContent && message.status === "STREAMING" && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-start",
              mb: 2,
            }}
          >
            <Box
              sx={{ width: "100%", p: 2, fontStyle: "italic", opacity: 0.7 }}
            >
              AI is thinking...
            </Box>
          </Box>
        )}
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

        {/* Load newer messages trigger - placed at bottom (visually) */}
        {hasPreviousPage && (
          <Box
            ref={loadNewerRef}
            sx={{
              py: 1,
              textAlign: "center",
              color: "text.secondary",
              fontSize: "0.875rem",
            }}
          >
            {isFetchingPreviousPage ? "Loading newer messages..." : ""}
          </Box>
        )}

        {/* Streaming messages section */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            // backgroundColor: "red",
          }}
        >
          {streamingMessage && renderMessages([streamingMessage])}
        </Box>

        {/* Previous messages section */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            // backgroundColor: "green",
          }}
        >
          {renderMessages(previousMessages)}
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

      {/* Manual sync button */}
      {chatId && (
        <Fab
          size="small"
          color={isStreamingActive ? "secondary" : "default"}
          onClick={manualSync}
          disabled={isListeningToStream}
          sx={{
            position: "absolute",
            bottom: 180,
            right: 16,
            zIndex: 1000,
            opacity: isStreamingActive ? 1 : 0.7,
          }}
          title={
            isListeningToStream
              ? "Syncing..."
              : isStreamingActive
              ? "Active stream - Click to sync"
              : "Manual sync"
          }
        >
          <SyncIcon
            sx={{
              animation: isListeningToStream
                ? "spin 1s linear infinite"
                : "none",
              "@keyframes spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" },
              },
            }}
          />
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
          sendMessage={sendMessage}
          isSending={isStreamingActive}
          abortStream={abortStream}
        />
        {chatId && <ModelSelector chatId={chatId} />}
      </Box>
    </Box>
  );
};

export default Chat;
