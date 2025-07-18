import { useMemo } from "react";
import { MessageType } from "./useChatMessages";
import { useChatStreaming } from "./useChatStreaming";

/**
 * filter out duplicates with streaming messages from last user message
 * @param streaming - streaming instance
 * @param pages - pages of messages
 * @returns prevMessages - messages before last user message
 */
const usePrevMessages = (
  streaming: ReturnType<typeof useChatStreaming>,
  pages: { messages: MessageType[] }[]
) => {
  const [streamingAiMessageId, streamingUserMessageId] = useMemo(() => {
    let streamingAiMessageId, streamingUserMessageId;
    for (const msg of streaming.streamingMessages.values()) {
      if (msg.from === "assistant") streamingAiMessageId = msg.id;
      if (msg.from === "user") streamingUserMessageId = msg.id;
    }
    return [streamingAiMessageId, streamingUserMessageId];
  }, [streaming.streamingMessages]);

  // Get cached messages and filter out duplicates with streaming messages
  const prevMessages = useMemo(() => {
    const streamingMessages = [streamingAiMessageId, streamingUserMessageId];
    const cachedMessages = pages.toReversed().flatMap((page) => page?.messages);
    if (!streamingAiMessageId && !streamingUserMessageId) return cachedMessages;

    // INFO: filter out duplicates with streaming messages from last user message
    const lastUserMessageIndex = cachedMessages.findLastIndex(
      (msg) => msg.from === "user"
    );
    return [
      ...cachedMessages.slice(0, lastUserMessageIndex),
      ...cachedMessages
        .slice(lastUserMessageIndex)
        .filter((msg) => !streamingMessages.includes(msg.id)),
    ];
  }, [pages, streamingAiMessageId, streamingUserMessageId]);

  return prevMessages;
};

export default usePrevMessages;
