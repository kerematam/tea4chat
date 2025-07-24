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

  // Get cached messages and filter out duplicates with streaming messages
  const prevMessages = useMemo(() => {
    const streamingMessages = Array.from(streaming.streamingMessages.values());
    const cachedMessages = pages.toReversed().flatMap((page) => page?.messages);

    return cachedMessages.filter((msg) => !streamingMessages.some(sm => sm.id === msg.id))

  }, [pages, streaming.streamingMessages]);

  return prevMessages;
};

export default usePrevMessages;
