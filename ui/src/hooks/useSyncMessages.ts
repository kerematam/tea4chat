import { useCallback, useMemo } from "react";
import { useStreamingStore } from "../store/streamingStore";
import { MessageType, StreamChunk } from "./useChatMessages";
import useValueChange from "./useValueChange";

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
    actions: { setStreamingMessages, handleStreamChunk: storeHandleStreamChunk },
  } = useStreamingStore();


  // Get streaming messages for this specific chat
  const streamingMessages = allStreamingMessages[chatId] || [];

  // Cached messages from pages
  const cachedMessages = useMemo(
    () => pages.toReversed().flatMap((page) => page?.messages),
    [pages]
  );

  // Find last user message index to determine streaming boundary
  const lastUserMessageIndex = useMemo(
    () => cachedMessages.findLastIndex((msg) => msg?.from === "user"),
    [cachedMessages]
  );

  // Split messages: prevMessages (before last user) + streamingMessages (from last user)
  const prevMessages = useMemo(() => {
    if (lastUserMessageIndex === -1) return cachedMessages;
    return cachedMessages.slice(0, lastUserMessageIndex);
  }, [cachedMessages, lastUserMessageIndex]);

  // TODO:
  // - find better way without JSON.stringify
  // - change with useOnChange approach
  // Reset streaming messages when pages change
  // useEffect(() => {
  //   // no message to set yet from infinite query call
  //   if (lastUserMessageIndex === -1 || !chatId) return;

  //   const messagesFromLastUser = cachedMessages.slice(lastUserMessageIndex);
  //   setStreamingMessages(chatId, messagesFromLastUser);
  // }, [cachedMessages, lastUserMessageIndex, chatId, setStreamingMessages]);
  useValueChange(lastUserMessageIndex, () => {
    if (lastUserMessageIndex === -1 || !chatId) return;
    const messagesFromLastUser = cachedMessages.slice(lastUserMessageIndex);
    setStreamingMessages(chatId, messagesFromLastUser);
  });

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

  console.log("state streamingMessages", allStreamingMessages);

  return {
    prevMessages,
    streamingMessages,
    handleStreamChunk,
  };
};

export default useSyncMessages;
