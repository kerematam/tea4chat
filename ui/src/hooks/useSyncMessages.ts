import { useCallback, useEffect, useMemo, useState } from "react";
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
  onStreamChunk?: (chunk: StreamChunk) => void
) => {
  // Streaming messages state - from last user message onwards
  const [streamingMessages, setStreamingMessages] = useState<MessageType[]>([]);

  // Cached messages from pages
  const cachedMessages = useMemo(() => pages.toReversed().flatMap((page) => page?.messages), [pages]);

  // Find last user message index to determine streaming boundary
  const lastUserMessageIndex = useMemo(() => cachedMessages.findLastIndex(msg => msg?.from === 'user'), [cachedMessages]);

  // Split messages: prevMessages (before last user) + streamingMessages (from last user)
  const prevMessages = useMemo(() => {
    if (lastUserMessageIndex === -1) return cachedMessages;
    return cachedMessages.slice(0, lastUserMessageIndex);
  }, [cachedMessages, lastUserMessageIndex]);

  // Reset streaming messages when pages change
  useEffect(() => {
    if (lastUserMessageIndex === -1) return;


    // Set streaming messages to last user message and messages after
    const messagesFromLastUser = cachedMessages.slice(lastUserMessageIndex);
    setStreamingMessages(prev => {
      // Only update if messages actually changed to prevent infinite loops
      if (JSON.stringify(prev) === JSON.stringify(messagesFromLastUser)) {
        return prev;
      }
      return messagesFromLastUser;
    });

  }, [cachedMessages, lastUserMessageIndex]);

  // Stream chunk handler
  const handleStreamChunk = useCallback((chunk: StreamChunk) => {
    switch (chunk.type) {
      case "userMessage":
        setStreamingMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(msg => msg.id === chunk.message.id);
          if (exists) return prev;
          return [...prev, chunk.message];
        });
        break;

      case "aiMessageStart":
        setStreamingMessages(prev => {
          const exists = prev.some(msg => msg.id === chunk.message.id);
          if (exists) return prev;
          return [...prev, chunk.message];
        });
        break;

      case "aiMessageChunk":
        setStreamingMessages(prev =>
          prev.map(msg =>
            msg.id === chunk.messageId
              ? { ...msg, content: (msg.content || '') + chunk.chunk }
              : msg
          )
        );
        break;

      case "aiMessageComplete":
        setStreamingMessages(prev =>
          prev.map(msg =>
            msg.id === chunk.message.id
              ? chunk.message
              : msg
          )
        );
        break;

      default:
        console.warn("Unknown stream chunk type:", chunk);
        break;
    }

    // Forward event to parent if provided
    onStreamChunk?.(chunk);
  }, [onStreamChunk]);

  return {
    prevMessages,
    streamingMessages,
    handleStreamChunk,
  };
};

export default useSyncMessages;
