import { useStreamingStore } from "@/store/streamingStore";
import { useCallback, useMemo } from "react";
import { trpc } from "@/services/trpc";
import { useChatStreaming } from "./useChatStreaming";
import { useRefreshLatestOnFocus } from "./useRefreshLatestOnFocus";
import useSyncMessages from "./useSyncMessages";
import useValueChange from "@/hooks/useValueChange";

/**
 * useChatMessages - A comprehensive hook for managing chat messages with real-time streaming
 *
 * STREAMING STRATEGY:
 * This hook uses a hybrid approach for optimal performance:
 *
 * 1. PRIMARY STREAMING (Fast & Direct):
 *    - Uses `trpc.message.sendWithStream` mutation for immediate streaming
 *    - This provides the fastest possible response as it streams directly from the AI provider
 *    - No Redis intermediary = minimal latency
 *
 * 2. FALLBACK STREAMING (Redis-based):
 *    - Uses `trpc.message.listenToMessageChunkStream` for reconnection scenarios
 *    - This streams from Redis state, which is slower but more reliable for reconnections
 *    - Used when the primary stream is interrupted or for manual sync
 *
 * 3. HISTORICAL MESSAGES:
 *    - Uses `trpc.message.getMessages.useInfiniteQuery` for paginated message history
 *    - Provides efficient loading of older messages with caching
 *    - Supports both forward and backward pagination
 *
 * ARCHITECTURE:
 * - Combines streaming messages (temporary, in-memory) with cached messages (persistent)
 * - Deduplicates messages using a Map to prevent duplicates during streaming
 * - Manages streaming state separately from query cache for optimal performance
 * - Handles chat creation, message sending, stream abortion, and reconnection scenarios
 *
 * This hook essentially wraps all chat message operations into a single, cohesive interface
 * that provides real-time streaming with reliable message persistence and pagination.
 */

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
    aiMessageChunk?: (
      messageId: string,
      fullContent: string,
      chatId: string
    ) => void;
    aiMessageComplete?: (message: MessageType) => void;
  };
}

// TODO: streaming only works on 4
const QUERY_LIMIT = 10;

export const useChatMessages = ({
  chatId,
  onChatCreated,
}: UseChatMessagesProps) => {
  const utils = trpc.useUtils();

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
        return firstPage.messages.at(-1)?.createdAt || firstPage.syncDate;
      },
    }
  );

  // Sync messages hook
  const { prevMessages, streamingMessages, handleStreamChunk } =
    useSyncMessages(messagesQuery.data?.pages || [], chatId || "");

  // Streaming hook
  const streaming = useChatStreaming({
    chatId,
    onChatCreated,
    onStreamChunk: handleStreamChunk,
    utils,
    // this is commented out because we should no longer need it as we update
    // the react query cache on streamingStore on stream end with
    // commitStreamingMessagesToQueryCache
    //
    // onStreamEnd: () => messagesQuery.fetchPreviousPage(),
  });

  // Manual sync function to trigger Redis stream listening
  const manualSync = useCallback(() => {
    if (!chatId) return;

    // Get syncDate from the first page to avoid processing already cached messages
    const firstPage = messagesQuery.data?.pages?.[0];
    const fromTimestamp = firstPage?.syncDate;

    streaming.listenToStream(fromTimestamp);
  }, [chatId, streaming, messagesQuery.data?.pages]);


  // this clears the streaming messages when new messages comes from infinite query
  const { actions } = useStreamingStore();

  // // 
  // useValueChange(messagesQuery.data?.pages?.[0]?.syncDate, (value) => {
  //   if (value && !streaming.isStreamingActive && chatId) {
  //     actions.clearStreamingMessages(chatId);
  //   }
  // });
  useValueChange(
    messagesQuery.data?.pages?.[0]?.streamingMessage?.id,
    (value) => {
      if (value) manualSync();
    }
  );

  // Check if there are more newer messages to load (previous page in backward direction)
  const hasPreviousPage = useMemo(() => {
    if (!messagesQuery.data?.pages?.length) return false;

    const firstPage = messagesQuery.data.pages[0];
    const hasMoreMessagesToLoad = firstPage?.messages?.length === QUERY_LIMIT;
    const isNewerMessages = firstPage?.direction === "backward";

    return hasMoreMessagesToLoad && isNewerMessages;
  }, [messagesQuery.data?.pages]);

  // Use custom hook for window focus refresh instead of manual implementation
  useRefreshLatestOnFocus(messagesQuery, {
    enabled: !!chatId && !streaming.isStreamingActive, // Only active when we have a chatId
    skipInitialLoad: true, // Skip refresh on initial load
  });

  return {
    // Messages data
    messages: prevMessages, // Cached/previous messages
    streamingMessages, // Current streaming messages

    // Query states
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,
    error: messagesQuery.error,

    // Streaming states
    isStreamingActive: streaming.isStreamingActive,
    isListeningToStream: streaming.isListeningToStream,

    // Pagination
    fetchNextPage: messagesQuery.fetchNextPage,
    fetchPreviousPage: messagesQuery.fetchPreviousPage,
    hasNextPage: messagesQuery.hasNextPage,
    hasPreviousPage,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    isFetchingPreviousPage: messagesQuery.isFetchingPreviousPage,

    // Message sending
    sendMessage: streaming.sendMessage,
    isSending: streaming.isSending,
    abortStream: streaming.abortStream,
    isAborting: streaming.isAborting,

    // Manual sync function for reconnection
    manualSync,
  };
};
