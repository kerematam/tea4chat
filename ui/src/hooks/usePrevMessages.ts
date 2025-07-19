import { useMemo } from "react";
import { MessageType } from "./useChatMessages";
import { useChatStreaming } from "./useChatStreaming";

/**
 * TODO: refactor/optimize this hook. Making common messages as seperate state
 * as Map might be better as it will automatically filter out duplicates.
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

  const prevMessages = useMemo(() => {
    const cachedMessages = pages.toReversed().flatMap((page) => page?.messages);
    return cachedMessages.filter((msg) => !streamingMessageIds.includes(msg.id))
  }, [pages, streamingMessageIds]);

  return prevMessages;
};

export default usePrevMessages;
