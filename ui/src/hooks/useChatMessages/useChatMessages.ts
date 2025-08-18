import useValueChange from "@/hooks/useValueChange";
import { trpc } from "@/services/trpc";
import { useCallback, useMemo } from "react";
import { useStreamingStore } from "./streamingStore";
import { useChatStreaming } from "./useChatStreaming";
import { useRefreshLatestOnFocus } from "./useRefreshLatestOnFocus";
import useSyncMessages from "./useSyncMessages";

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

// Re-export MessageType from shared types to maintain consistency
export type { MessageType } from "../types";

import { MessageType } from "../types";

export type StreamChunk =
  | { type: "messageStart"; message: MessageType; chatId: string }
  | {
      type: "agentChunk";
      messageId: string;
      chunk: string;
      chatId: string;
    }
  | { type: "messageComplete"; message: MessageType; chatId: string };

interface UseChatMessagesProps {
  chatId?: string; // Made optional to support chat creation
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
  chunkHandlers?: {
    messageStart?: (message: MessageType) => void;
    agentChunk?: (
      messageId: string,
      fullAgentContent: string,
      chatId: string
    ) => void;
    messageComplete?: (message: MessageType) => void;
  };
}

// TODO: streaming only works on 4
const QUERY_LIMIT = 2;

export const useChatMessages = ({
  chatId,
  onChatCreated,
}: UseChatMessagesProps) => {
  const utils = trpc.useUtils();

  // Infinite query for messages (only enabled when chatId exists)
  // console.log("2 chatId", chatId);
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
      // older messages.
      getNextPageParam: (lastPage) => {
        // If oldest page, has returned less than QUERY_LIMIT messages then we
        // don't need to fetch more messages
        if (!lastPage || lastPage.messages.length < QUERY_LIMIT) {
          return undefined;
        }
        return lastPage.messages[0].finishedAt;
      },
      // newer messages.
      getPreviousPageParam: (firstPage) => {
        // We will keep fetching newer always active, so getPreviousPageParam
        // should always return a value
        return firstPage.messages.at(-1)?.finishedAt || firstPage.syncDate;
      },
    }
  );

  // Sync messages hook
  const { prevMessages, streamingMessage, handleStreamChunk } = useSyncMessages(
    messagesQuery.data?.pages || [],
    chatId || ""
  );

  // Streaming hook
  const streaming = useChatStreaming({
    chatId,
    onChatCreated,
    onStreamChunk: handleStreamChunk,
    utils,
    // TODO: move state synching implementation to one place. it is too spread out
    onStreamEnd: () => {
      messagesQuery.fetchPreviousPage();
    },
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
  useValueChange(
    messagesQuery.data?.pages?.[0]?.streamingMessage?.id,
    (streamingMessageId) => {
      if (streamingMessageId) {
        // there is a streaming message, so we need to sync
        manualSync();
      } else if (chatId) {
        // no streaming message, so we need to clear the streaming message
        actions.clearStreamingMessage(chatId);
      }
    }
  );

  // NOTE: hasPreviousPage is only used, when there is new pages to fetch on
  // page load and we don't rely on `messagesQuery.hasPreviousPage` here. We
  // always return a cursor from `getPreviousPageParam` to keep the "load newer"
  // behavior available for manual refresh. That makes React Query think there
  // is always a previous page, which is not a real indicator of newer data.
  // Instead, derive the actual "has newer" state by inspecting the first page:
  // - it must be fetched in the "backward" (newer) direction, and
  // - it must be a full page (length === QUERY_LIMIT). This tells us there may
  //   be more newer messages to load. Check if there are more newer messages to
  //   load (previous page in backward direction)
  const hasPreviousPage = useMemo(() => {
    if (!messagesQuery.data?.pages?.length) return false;

    const firstPage = messagesQuery.data.pages[0];
    if (firstPage.direction !== "backward") return false;

    return firstPage.messages.length === QUERY_LIMIT;
  }, [messagesQuery.data?.pages]);

  // Use custom hook for window focus refresh instead of manual implementation
  useRefreshLatestOnFocus(messagesQuery, {
    enabled: !!chatId, // && !streaming.isActive, TODO: check if it breaks to trigger this during streaming
    skipInitialLoad: true, // Skip refresh on initial load
  });

  return {
    // Messages data
    messages: prevMessages, // Cached/previous messages
    streamingMessage, // Current streaming messages

    // Query states
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,
    error: messagesQuery.error,

    // Streaming states
    isStreamingActive: streaming.isActive,
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
