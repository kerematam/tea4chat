import { useMemo } from "react";
import { MessageType } from "./useChatMessages";
import { useChatStreaming } from "./useChatStreaming";

/**
 *
 * filter out duplicates with streaming messages from last user message
 * @param streaming - streaming instance
 * @param pages - pages of messages
 * @returns prevMessages - messages before last user message
 */
const usePrevMessages = (
  streaming: ReturnType<typeof useChatStreaming>,
  pages: { messages: MessageType[] }[]
) => {

  const streamingMessageIds = useMemo(() =>
    Array.from(streaming.streamingMessages.keys()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming.streamingMessages.size]
  );

  const cachedMessages = useMemo(() => 
    pages.toReversed().flatMap((page) => page?.messages),
    [pages]
  );

  const prevMessages = useMemo(() => {
    if (cachedMessages.length === 0) return [];
    
    const lastTwoMessages = cachedMessages.slice(-2);
    const filteredLastTwo = lastTwoMessages.filter((msg) => 
      !streamingMessageIds.includes(msg.id)
    );
    
    // If no messages were filtered out, return the original array
    if (filteredLastTwo.length === lastTwoMessages.length) {
      return cachedMessages;
    }
    
    const prevMessagesExceptLastTwo = cachedMessages.slice(0, -2);
    return [...prevMessagesExceptLastTwo, ...filteredLastTwo];
  }, [cachedMessages, streamingMessageIds]);

  return prevMessages;
};

export default usePrevMessages;
