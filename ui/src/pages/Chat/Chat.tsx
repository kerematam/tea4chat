import { Box, Container, Fab } from "@mui/material";
import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import { ChatTextForm } from "../../components/ChatTextForm/ChatTextForm";
import AgentMessage from "./components/AgentMessage/AgentMessage";
import ModelSelector from "./components/ModelSelector/ModelSelector";

import { trpc } from "../../services/trpc";
import dayjs from "dayjs";
import { type MessageType as ServerMessageType } from "../../../../server/src/router/messageRouter";

export type MessageType = Omit<ServerMessageType, "createdAt"> & {
  createdAt: string;
};

export type SqlTable = {
  columns: string[];
  rows: Record<string, unknown>[];
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

// Types for better type safety
type InfiniteQueryData = {
  pages: Array<{
    messages: MessageType[];
    direction: "backward" | "forward";
    syncDate: string;
  }>;
};

type UseLoadNewMessagesProps = {
  fetchPreviousPage: () => void;
  data: InfiniteQueryData | undefined;
  isFetchingPreviousPage: boolean;
};

/**
 * Hook to automatically load new messages in two scenarios:
 * 1. Window focus: When user returns to the tab (after initial load)
 * 2. Continuous loading: When new message pages are available on response of
 *    request that triggered by window focus.
 */
const useLoadNewMessages = ({
  fetchPreviousPage,
  data,
  isFetchingPreviousPage,
}: UseLoadNewMessagesProps) => {
  // Check if this is the initial load (no pages fetched yet)
  const isInitialLoad = useMemo(
    () => !data?.pages || data?.pages.length === 0,
    [data?.pages]
  );

  // Check if we should continue loading more messages
  const shouldContinueLoading = useMemo(() => {
    if (!data?.pages?.length || isFetchingPreviousPage) return false;

    const firstPage = data.pages[0];
    const hasMoreMessagesToLoad = firstPage?.messages?.length === QUERY_LIMIT;
    const hasMultiplePages = data.pages.length > 1;

    // Continue loading if:
    // - First page has messages (indicating more might be available)
    // - We have multiple pages (not just the initial empty page). Loading
    //   initial page is reserved for forward pagination (older messages).
    return hasMoreMessagesToLoad && hasMultiplePages;
  }, [data?.pages, isFetchingPreviousPage]);

  // Continuous loading effect
  useEffect(() => {
    if (!shouldContinueLoading) return;

    const timeoutId = setTimeout(() => {
      fetchPreviousPage();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [shouldContinueLoading, fetchPreviousPage]);

  // Window focus loading effect
  useEffect(() => {
    const handleWindowFocus = () => {
      // Only fetch on focus if:
      // - Not currently fetching
      // - Not the initial load
      if (!isFetchingPreviousPage && !isInitialLoad) {
        fetchPreviousPage();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [fetchPreviousPage, isFetchingPreviousPage, isInitialLoad]);
};

const QUERY_LIMIT = 4;

const Chat = () => {
  const { id: chatId } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Intersection observer for loading more messages - placed at the end of older messages
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "50px",
  });

  // Use infinite query for cursor-based pagination
  const {
    data,
    error,
    isLoading,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
  } = trpc.message.getMessages.useInfiniteQuery(
    {
      chatId: chatId!,
      limit: QUERY_LIMIT,
    },
    {
      initialCursor: new Date().toISOString(),
      enabled: !!chatId,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      // older
      getNextPageParam: (lastPage) => {
        if (!lastPage || lastPage.messages.length < QUERY_LIMIT) {
          return undefined;
        }

        // Use the first message's createdAt date for forward pagination (older messages)
        return lastPage.messages[0].createdAt;
      },
      // newer messages
      getPreviousPageParam: (firstPage) => {
        if (firstPage === undefined) {
          // this should not happend and backend will return error.
          throw new Error(
            "Newer messages should always requested from last page synch time. If there is no page, query should not be triggered."
          );
        }

        // TODO: change this to sync date
        return firstPage.syncDate;
      },
    }
  );

  useLoadNewMessages({
    fetchPreviousPage,
    data,
    isFetchingPreviousPage,
  });

  // Load older messages when intersection observer is triggered
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all messages from all pages
  const allMessages = useMemo(() => {
    if (data?.pages) {
      const reversedPages = [...data.pages].reverse();
      return reversedPages.flatMap((page) => page?.messages || []) || [];
    }
    return [];
  }, [data?.pages]);

  const [prevMessages, newMessages] = useMessagesGrouping(allMessages);

  const utils = trpc.useUtils();

  // Add new messages by updating query data directly (no request)
  const addNewMessages = (messages: MessageType[]) => {
    if (!chatId) {
      throw new Error("Chat ID is required");
    }

    if (messages.length === 0) {
      return;
    }

    // Match the exact query key structure from React Query devtools
    const queryInput = {
      chatId,
      limit: QUERY_LIMIT,
      cursor: new Date().toISOString(),
    };
    const currentData = utils.message.getMessages.getInfiniteData(queryInput);

    if (!currentData || !currentData.pages.length) {
      throw new Error("Could not find current data");
    }

    // Add new messages to the first page (most recent messages)
    const lastMessage = messages.at(-1);
    if (!lastMessage) throw new Error("No messages to add");

    const syncDate = lastMessage.createdAt;
    const updatedFirstPage = {
      messages: messages,
      direction: "backward",
      syncDate,
      optimistic: true,
    };

    // Update the infinite query data
    utils.message.getMessages.setInfiniteData(queryInput, {
      pages: [
        updatedFirstPage as InfiniteQueryData["pages"][number],
        ...currentData.pages,
      ],
      pageParams: [currentData.pages[0]?.syncDate, ...currentData.pageParams],
    });
  };

  // Update a specific message in the query cache
  const updateMessageInCache = (
    messageId: string,
    updates: Partial<MessageType>
  ) => {
    if (!chatId) return;

    const queryInput = {
      chatId,
      limit: QUERY_LIMIT,
      cursor: new Date().toISOString(),
    };
    const currentData = utils.message.getMessages.getInfiniteData(queryInput);

    if (!currentData || !currentData.pages.length) return;

    // Find and update the message across all pages
    const updatedPages = currentData.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === messageId ? { ...message, ...updates } : message
      ),
    }));

    utils.message.getMessages.setInfiniteData(queryInput, {
      ...currentData,
      pages: updatedPages,
    });
  };

  // Handle streaming updates from the form
  const handleStreamingUpdate = (chunk: StreamChunk) => {
    if (chunk.type === "aiMessageStart") {
      // Add the initial AI message to cache
      addNewMessages([chunk.message]);
    } else if (chunk.type === "aiMessageChunk") {
      // Update the AI message content in cache
      updateMessageInCache(chunk.messageId, {
        content: chunk.fullContent,
        text: chunk.fullContent,
      });
    } else if (chunk.type === "aiMessageComplete") {
      // Update with final complete message
      updateMessageInCache(chunk.message.id, chunk.message);
    }
  };

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

  // Get current model selection for this chat
  const { data: selectionData } = trpc.model.getSelection.useQuery({ chatId });
  const selectedModelId = selectionData?.selected?.id;

  // TODO: re-render of this component breaks the streaming
  const textForm = useMemo(() => {
    return (
      <ChatTextForm
        placeholder="Type your message here..."
        chatId={chatId}
        modelId={selectedModelId}
        onNewMessages={addNewMessages}
        onStreamingUpdate={handleStreamingUpdate}
      />
    );
  }, [chatId, selectedModelId]);

  if (!chatId) {
    return <div>Error: No chat ID provided</div>;
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
                bgcolor: "primary.main",
              }}
            >
              {message.content} -{" "}
              {dayjs(message.createdAt).format("DD/MM/YYYY HH:mm:ss")} -{" "}
              {message.id}
            </Box>
          ) : (
            <Box sx={{ width: "100%" }}>
              <AgentMessage message={message} /> -{" "}
              {dayjs(message.createdAt).format("DD/MM/YYYY HH:mm:ss")} -{" "}
              {message.id}
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

        {/* Intersection observer trigger for loading older messages */}
        {hasNextPage && (
          <div ref={loadMoreRef} style={{ height: "20px", margin: "10px 0" }}>
            {isFetchingNextPage && (
              <Box sx={{ textAlign: "center", py: 2 }}>
                Loading older messages...
              </Box>
            )}
          </div>
        )}
      </Container>

      {/* <Button onClick={() => fetchNextPage()}>Fetch Previous Page</Button>
      <Button onClick={() => fetchPreviousPage()}>Fetch Next Page</Button>
      <Button onClick={() => fetchNextPage({})}>Refetch</Button> */}

      <Box
        sx={{
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default",
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          pb: 5,
        }}
      >
        {textForm}
        <ModelSelector chatId={chatId} />
      </Box>

      {showScrollButton && (
        <Fab
          size="small"
          color="primary"
          sx={{
            position: "absolute",
            bottom: 140,
            right: 20,
            zIndex: 2,
          }}
          onClick={scrollToBottom}
        >
          <KeyboardArrowDownIcon />
        </Fab>
      )}
    </Box>
  );
};

export default Chat;
