import { useCallback, useEffect, useMemo, useState } from "react";
import { isUserAbortError } from "../../../server/src/lib/errors";
import { useNotify } from "../providers/NotificationProdiver/useNotify";
import { trpc } from "../services/trpc";
import { useRefreshLatestOnFocus } from "./useRefreshLatestOnFocus";

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
    chatId: string;
  }
  | { type: "aiMessageComplete"; message: MessageType; chatId: string };

interface UseChatMessagesProps {
  chatId?: string; // Made optional to support chat creation
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
  chunkHandlers?: {
    userMessage?: (message: MessageType) => void;
    aiMessageStart?: (message: MessageType) => void;
    aiMessageChunk?: (messageId: string, fullContent: string, chatId: string) => void;
    aiMessageComplete?: (message: MessageType) => void;
  };
}

// TODO: streaming only works on 4
const QUERY_LIMIT = 20;

export const useChatMessages = ({
  chatId,
  onChatCreated,
  chunkHandlers,
}: UseChatMessagesProps) => {
  const { error } = useNotify();
  const utils = trpc.useUtils();

  // Streaming state - separate from query cache
  const [streamingMessages, setStreamingMessages] = useState<Map<string, MessageType>>(new Map());

  // Infinite query for messages (only enabled when chatId exists)
  const messagesQuery = trpc.message.getMessages.useInfiniteQuery(
    {
      chatId: chatId!, // Assert non-null since query is disabled when chatId is undefined
      limit: QUERY_LIMIT,
    },
    {
      initialCursor: new Date().toISOString(),
      enabled: !!chatId, // Only run query when chatId exists
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: false, // Don't refetch when component mounts
      refetchOnReconnect: true, // Keep this for network issues
      staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days - consider data fresh for longer
      // older messages
      getNextPageParam: (lastPage) => {
        if (!lastPage || lastPage.messages.length < QUERY_LIMIT) {
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
          handleStreamingUpdate(chunk);
        }
      } catch (err) {
        console.error("Stream processing error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to process stream: ${(err as Error).message}`);
        }
      } finally {
        // Stream ended - fetch new messages and clear streaming state
        setStreamingMessages(new Map());

        // Fetch new messages from server
        if (chatId) {
          messagesQuery.fetchPreviousPage();
        }
      }
    },
    onError: (err) => {
      setStreamingMessages(new Map());

      // Don't show error if user aborted the stream
      if (!isUserAbortError(err)) {
        error(`Failed to send message: ${err.message}`);
      }
    },
  });

  // Redis stream listening mutation for reconnection scenarios
  const listenToStreamMutation = trpc.message.listenToMessageChunkStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the Redis stream
      try {
        for await (const chunk of streamGenerator) {
          handleStreamingUpdate(chunk as StreamChunk);
        }
      } catch (err) {
        console.error("Redis stream listening error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to listen to stream: ${(err as Error).message}`);
        }
      } finally {
        // Stream listening ended - fetch new messages and clear streaming state if needed
      }
    },
    onError: (err) => {
      console.error("Failed to listen to Redis stream:", err);
      error(`Failed to listen to stream: ${err.message}`);
    },
  });

  // Abort stream mutation
  const abortStreamMutation = trpc.message.abortStream.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setStreamingMessages(new Map());
      }
    },
    onError: (err) => {
      console.error("Failed to abort stream:", err);
      error(`Failed to abort stream: ${err.message}`);
    },
  });

  // Derived streaming state from mutations
  const isStreamingActive = sendMessageMutation.isPending || listenToStreamMutation.isPending;

  // Send message function (supports chat creation)
  const sendMessage = useCallback((content: string, modelId?: string) => {
    if (!content.trim() || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      content: content.trim(),
      chatId, // Can be undefined for new chat creation
      modelId,
    });
  }, [chatId, sendMessageMutation]);

  // Abort stream function
  const abortStream = useCallback(() => {
    if (!chatId || !sendMessageMutation.isPending) return;

    abortStreamMutation.mutate({
      chatId,
    });
  }, [chatId, sendMessageMutation.isPending, abortStreamMutation]);

  // Manual sync function to trigger Redis stream listening
  const manualSync = useCallback(() => {
    if (!chatId || listenToStreamMutation.isPending) return;

    // Get syncDate from the first page to avoid processing already cached messages
    const firstPage = messagesQuery.data?.pages?.[0];
    const fromTimestamp = firstPage?.syncDate;

    listenToStreamMutation.mutate({
      chatId,
      ...(fromTimestamp && { fromTimestamp })
    });
  }, [chatId, listenToStreamMutation, messagesQuery.data?.pages]);


  // TODO: this is a hack to sync the stream when new messages are added
  const syncDate = messagesQuery.data?.pages?.[0]?.syncDate;
  useEffect(() => {
    if (syncDate) manualSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncDate])

  // Streaming update handler - now only updates streaming state
  const handleStreamingUpdate = useCallback((chunk: StreamChunk) => {
    switch (chunk.type) {
      case "userMessage":
        // If this is a new chat creation, notify parent
        if (!chatId && chunk.chatId) {
          utils.chat.getAll.invalidate();
          onChatCreated?.({ chatId: chunk.chatId });
        }

        // Add user message to streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.userMessage?.(chunk.message as MessageType);
        break;

      case "aiMessageStart":
        // Add AI message to streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.aiMessageStart?.(chunk.message as MessageType);
        break;

      case "aiMessageChunk": {
        let fullContent = "";

        // Update the AI message in streaming state
        setStreamingMessages(prev => {
          const existingMessage = prev.get(chunk.messageId);
          if (existingMessage) {
            const newMap = new Map(prev);
            // Accumulate the chunk content from existing message content
            const currentContent = existingMessage.content || "";
            fullContent = currentContent + chunk.chunk;
            const updatedMessage = {
              ...existingMessage,
              content: fullContent,
              text: fullContent,
            };
            newMap.set(chunk.messageId, updatedMessage);
            return newMap;
          }
          return prev;
        });

        chunkHandlers?.aiMessageChunk?.(chunk.messageId, fullContent, chunk.chatId);
        break;
      }

      case "aiMessageComplete":
        // Update with final complete message in streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.aiMessageComplete?.(chunk.message as MessageType);
        break;

      default:
        // Handle unexpected chunk types gracefully
        console.warn("Unknown stream chunk type:", chunk);
        break;
    }
  }, [chatId, onChatCreated, utils.chat.getAll, chunkHandlers]);

  // Auto-load new messages logic
  const shouldContinueLoading = useMemo(() => {
    if (!messagesQuery.data?.pages?.length || messagesQuery.isFetchingPreviousPage) return false;

    const firstPage = messagesQuery.data.pages[0];
    const hasMoreMessagesToLoad = firstPage?.messages?.length === QUERY_LIMIT;
    const hasMultiplePages = messagesQuery.data.pages.length > 1;

    return hasMoreMessagesToLoad && hasMultiplePages;
  }, [messagesQuery.data?.pages, messagesQuery.isFetchingPreviousPage]);

  // Continuous loading effect
  useEffect(() => {
    if (!shouldContinueLoading) return;

    const timeoutId = setTimeout(() => {
      messagesQuery.fetchPreviousPage();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [shouldContinueLoading, messagesQuery]);

  // Use custom hook for window focus refresh instead of manual implementation
  useRefreshLatestOnFocus(messagesQuery, {
    enabled: !!chatId, // Only active when we have a chatId
    skipInitialLoad: true, // Skip refresh on initial load
  });

  // Combine cached messages with streaming messages, using Map for deduplication
  const allMessages = useMemo(() => {
    // Get cached messages from query
    const cachedMessages = messagesQuery.data?.pages
      ? [...messagesQuery.data.pages].reverse().flatMap((page) => page?.messages || [])
      : [];

    // Create a Map for deduplication - use message ID as key
    const messageMap = new Map<string, MessageType>();

    // Add cached messages first
    cachedMessages.forEach(message => {
      messageMap.set(message.id, message);
    });

    // Add streaming messages (they will override cached ones if duplicate IDs)
    streamingMessages.forEach((message, id) => {
      messageMap.set(id, message);
    });

    // Convert back to array, sorted by creation time
    const _allMessages = Array.from(messageMap.values()).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return _allMessages;
  }, [messagesQuery.data?.pages, streamingMessages]);

  return {
    // Messages data
    messages: allMessages,

    // Query states
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,
    error: messagesQuery.error,

    // Streaming states
    isStreamingActive,
    isListeningToStream: listenToStreamMutation.isPending,

    // Pagination
    fetchNextPage: messagesQuery.fetchNextPage,
    fetchPreviousPage: messagesQuery.fetchPreviousPage,
    hasNextPage: messagesQuery.hasNextPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    isFetchingPreviousPage: messagesQuery.isFetchingPreviousPage,

    // Message sending
    sendMessage,
    isSending: sendMessageMutation.isPending,
    abortStream,
    isAborting: abortStreamMutation.isPending,

    // Streaming handler
    handleStreamingUpdate,

    // Manual sync function for reconnection
    manualSync,
  };
}; 