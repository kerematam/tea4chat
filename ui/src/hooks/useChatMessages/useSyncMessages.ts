import { useCallback, useMemo } from "react";
import { MessageType } from "../types";
import { useStreamingStore } from "./streamingStore";
import { StreamChunk } from "./useChatMessages";

/**
 * useSyncMessages - Manages synchronized messages with streaming state
 *
 * This hook handles:
 * 1. prevMessages - All messages except streaming ones
 * 2. streamingMessages - Messages from last user message onwards
 * 3. Stream event processing and state updates
 * 4. Redundancy prevention between cached and streaming messages
 */
const useSyncMessages = (
  pages: { messages: MessageType[] }[],
  chatId: string,
  onStreamChunk?: (chunk: StreamChunk) => void
) => {
  const {
    streamingMessages: allStreamingMessages,
    actions: { handleStreamChunk: storeHandleStreamChunk },
  } = useStreamingStore();

  const prevMessages = useMemo(
    () => pages.toReversed().flatMap((page) => page?.messages),
    [pages]
  );

  const streamingMessage = useMemo(() => {
    const streamingMessage = allStreamingMessages[chatId];
    return streamingMessage && prevMessages.at(-1)?.id !== streamingMessage.id
      ? streamingMessage
      : null;
  }, [prevMessages, allStreamingMessages, chatId]);

  // Stream chunk handler
  const handleStreamChunk = useCallback(
    (chunk: StreamChunk) => {
      // Handle the chunk using the store
      storeHandleStreamChunk(chatId, chunk);

      // Forward event to parent if provided
      onStreamChunk?.(chunk);
    },
    [chatId, storeHandleStreamChunk, onStreamChunk]
  );

  return {
    prevMessages,
    streamingMessage,
    handleStreamChunk,
  };
};

export default useSyncMessages;
