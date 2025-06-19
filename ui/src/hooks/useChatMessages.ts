import { useCallback, useEffect, useMemo } from "react";
import { trpc } from "../services/trpc";
import { useNotify } from "../providers/NotificationProdiver/useNotify";

// MessageType for client-side (createdAt is serialized as string)
export type MessageType = {
  id: string;
  createdAt: string;
  chatId: string;
  content: string;
  from: string;
  text: string;
};

export type StreamChunk =
  | { type: "userMessage"; message: MessageType; chatId: string }
  | { type: "aiMessageStart"; message: MessageType; chatId: string }
  | {
    type: "aiMessageChunk";
    messageId: string;
    chunk: string;
    fullContent: string;
    chatId: string;
  }
  | { type: "aiMessageComplete"; message: MessageType; chatId: string };

// Types for better type safety
type InfiniteQueryData = {
  pages: Array<{
    messages: MessageType[];
    direction: "backward" | "forward";
    syncDate: string;
  }>;
};

interface UseChatMessagesProps {
  chatId?: string; // Made optional to support chat creation
  limit?: number;
  onStreamingUpdate?: (chunk: StreamChunk) => void;
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
}

export const useChatMessages = ({
  chatId,
  limit = 4,
  onStreamingUpdate,
  onChatCreated,
}: UseChatMessagesProps) => {
  const { error } = useNotify();
  const utils = trpc.useUtils();

  // Infinite query for messages (only enabled when chatId exists)
  const messagesQuery = trpc.message.getMessages.useInfiniteQuery(
    {
      chatId: chatId!, // Assert non-null since query is disabled when chatId is undefined
      limit,
    },
    {
      initialCursor: new Date().toISOString(),
      enabled: !!chatId, // Only run query when chatId exists
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: false, // Don't refetch when component mounts
      refetchOnReconnect: true, // Keep this for network issues
      staleTime: 1000 * 60 * 60, // 1 hour - consider data fresh for longer
      // older messages
      getNextPageParam: (lastPage) => {
        if (!lastPage || lastPage.messages.length < limit) {
          return undefined;
        }
        return lastPage.messages[0].createdAt;
      },
      // newer messages
      getPreviousPageParam: (firstPage) => {
        if (firstPage === undefined) {
          throw new Error(
            "Newer messages should always requested from last page synch time."
          );
        }
        return firstPage.syncDate;
      }
    }
  );

  // Streaming mutation
  const sendMessageMutation = trpc.message.sendWithStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the stream
      try {
        for await (const chunk of streamGenerator) {
          if (onStreamingUpdate) {
            onStreamingUpdate(chunk);
          } else {
            // Use default handler if no custom handler provided
            handleStreamingUpdate(chunk);
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

  // Add new messages by updating query data directly (no request) - COPIED FROM WORKING IMPLEMENTATION
  const addNewMessages = useCallback((messages: MessageType[], targetChatId?: string) => {
    // Use provided targetChatId or fall back to the hook's chatId
    const activeChatId = targetChatId || chatId;

    if (!activeChatId) {
      return;
    }

    if (messages.length === 0) {
      return;
    }

    // Match the exact query key structure from React Query devtools
    const queryInput = {
      chatId: activeChatId,
      limit,
      cursor: new Date().toISOString(),
    };
    const currentData = utils.message.getMessages.getInfiniteData(queryInput);

    if (!currentData || !currentData.pages.length) {
      // Initialize cache if it doesn't exist (for new chats)
      const lastMessage = messages.at(-1);
      if (!lastMessage) return;

      const syncDate = lastMessage.createdAt;
      const initialPage = {
        messages: messages,
        direction: "backward" as const,
        syncDate,
        optimistic: true,
      };

      utils.message.getMessages.setInfiniteData(queryInput, {
        pages: [initialPage as InfiniteQueryData["pages"][number]],
        pageParams: [syncDate],
      });
      return;
    }

    // Add new messages to the first page (most recent messages)
    const lastMessage = messages.at(-1);
    if (!lastMessage) throw new Error("No messages to add");

    const syncDate = lastMessage.createdAt;
    const updatedFirstPage = {
      messages: messages,
      direction: "backward" as const,
      syncDate,
      optimistic: true,
    };

    // Update the infinite query data - CREATE NEW PAGE AT BEGINNING
    utils.message.getMessages.setInfiniteData(queryInput, {
      pages: [
        updatedFirstPage as InfiniteQueryData["pages"][number],
        ...currentData.pages,
      ],
      pageParams: [currentData.pages[0]?.syncDate, ...currentData.pageParams],
    });
  }, [chatId, limit, utils.message.getMessages]);

  // Update a specific message in the query cache - COPIED FROM WORKING IMPLEMENTATION
  const updateMessageInCache = useCallback((
    messageId: string,
    updates: Partial<MessageType>,
    targetChatId?: string
  ) => {
    // Use provided targetChatId or fall back to the hook's chatId
    const activeChatId = targetChatId || chatId;

    if (!activeChatId) {
      return;
    }

    const queryInput = {
      chatId: activeChatId,
      limit,
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
  }, [chatId, limit, utils.message.getMessages]);

  // Initialize cache for new chat
  const initializeChatCache = useCallback((newChatId: string) => {
    const queryInput = {
      chatId: newChatId,
      limit,
      cursor: new Date().toISOString(),
    };

    // Set initial empty page structure
    utils.message.getMessages.setInfiniteData(queryInput, {
      pages: [{
        messages: [],
        direction: "backward" as const,
        syncDate: new Date().toISOString(),
      }],
      pageParams: [new Date().toISOString()],
    });
  }, [utils.message.getMessages, limit]);

  // Send message function (supports chat creation)
  const sendMessage = useCallback((content: string, modelId?: string) => {
    if (!content.trim() || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      content: content.trim(),
      chatId, // Can be undefined for new chat creation
      modelId,
    });
  }, [chatId, sendMessageMutation]);

  // Default streaming update handler - COPIED FROM WORKING IMPLEMENTATION
  const handleStreamingUpdate = useCallback((chunk: StreamChunk) => {
    if (chunk.type === "userMessage") {
      // If this is a new chat creation, initialize cache first
      if (!chatId && chunk.chatId) {
        utils.chat.getAll.invalidate();
        initializeChatCache(chunk.chatId);
        onChatCreated?.({ chatId: chunk.chatId });
      }
      // Add the user message to cache (use chatId from chunk)
      addNewMessages([chunk.message], chunk.chatId);
    } else if (chunk.type === "aiMessageStart") {
      // Add the initial AI message to cache (use chatId from chunk)
      addNewMessages([chunk.message], chunk.chatId);
    } else if (chunk.type === "aiMessageChunk") {
      // Update the AI message content in cache (use chatId from chunk)
      updateMessageInCache(chunk.messageId, {
        content: chunk.fullContent,
        text: chunk.fullContent,
      }, chunk.chatId);
    } else if (chunk.type === "aiMessageComplete") {
      // Update with final complete message (use chatId from chunk)
      updateMessageInCache(chunk.message.id, chunk.message, chunk.chatId);
    }
  }, [addNewMessages, updateMessageInCache, chatId, initializeChatCache, onChatCreated, utils.chat.getAll]);

  // Auto-load new messages logic - COPIED FROM WORKING IMPLEMENTATION
  const isInitialLoad = useMemo(
    () => !messagesQuery.data?.pages || messagesQuery.data?.pages.length === 0,
    [messagesQuery.data?.pages]
  );

  const shouldContinueLoading = useMemo(() => {
    if (!messagesQuery.data?.pages?.length || messagesQuery.isFetchingPreviousPage) return false;

    const firstPage = messagesQuery.data.pages[0];
    const hasMoreMessagesToLoad = firstPage?.messages?.length === limit;
    const hasMultiplePages = messagesQuery.data.pages.length > 1;

    return hasMoreMessagesToLoad && hasMultiplePages;
  }, [messagesQuery.data?.pages, messagesQuery.isFetchingPreviousPage, limit]);

  // Continuous loading effect
  useEffect(() => {
    if (!shouldContinueLoading) return;

    const timeoutId = setTimeout(() => {
      messagesQuery.fetchPreviousPage();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [shouldContinueLoading, messagesQuery]);

  // Window focus loading effect
  useEffect(() => {
    const handleWindowFocus = () => {
      if (!messagesQuery.isFetchingPreviousPage && !isInitialLoad) {
        messagesQuery.fetchPreviousPage();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [messagesQuery, isInitialLoad]);

  // Flatten all messages from all pages - COPIED FROM WORKING IMPLEMENTATION
  const allMessages = useMemo(() => {
    if (messagesQuery.data?.pages) {
      const reversedPages = [...messagesQuery.data.pages].reverse();
      return reversedPages.flatMap((page) => page?.messages || []) || [];
    }
    return [];
  }, [messagesQuery.data?.pages]);

  return {
    // Messages data
    messages: allMessages,

    // Query states
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,
    error: messagesQuery.error,

    // Pagination
    fetchNextPage: messagesQuery.fetchNextPage,
    fetchPreviousPage: messagesQuery.fetchPreviousPage,
    hasNextPage: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    isFetchingPreviousPage: messagesQuery.isFetchingPreviousPage,

    // Message sending
    sendMessage,
    isSending: sendMessageMutation.isPending,

    // Cache helpers
    addNewMessages,
    updateMessageInCache,
    initializeChatCache, // For manual cache initialization

    // Streaming handler
    handleStreamingUpdate,
  };
}; 