import { useCallback, useMemo } from "react";
import { useStreamingStore } from "../store/streamingStore";
import { MessageType, StreamChunk } from "./useChatMessages";

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

  const messagesAfterLastUserMessage = useMemo(() => {
    const index = prevMessages.findLastIndex((msg) => msg?.from === "user");
    return index === -1 ? [] : prevMessages.slice(index);
  }, [prevMessages]);


  const streamingMessages = useMemo(() => {
    const rawStreamingMessages = allStreamingMessages[chatId] || [];

    // filter out messages that are already in prevMessages
    return rawStreamingMessages.filter(
      (msg) => !messagesAfterLastUserMessage.some((m) => m.id === msg.id)
    );
  }, [messagesAfterLastUserMessage, allStreamingMessages, chatId]);

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
    streamingMessages,
    handleStreamChunk,
  };
};

export default useSyncMessages;
