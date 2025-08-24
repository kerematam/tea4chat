import { useNotify } from "@/providers/NotificationProdiver/useNotify";
import { trpc } from "@/services/trpc";
import { isUserAbortError } from "@/utils";
import { useCallback } from "react";
import { useStreamingStore } from "./streamingStore";
import { StreamChunk } from "./useChatMessages";

interface UseChatStreamingProps {
  chatId?: string;
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
  onStreamChunk?: (chunk: StreamChunk) => void;
  utils: ReturnType<typeof trpc.useUtils>; // TRPC utils for invalidating chat list
}

// TODO: we unnessarily evaluate both agent message and user message on database at
// same level. It should be merged into one. It will simplify the code.

// const useHasActiveMutation = (chatId?: string) => {
//   const mutationCache = queryClient.getMutationCache();
//   if (!chatId) return false;
//   const mutations = mutationCache.findAll({
//     predicate: (m) => {
//       const variables = m.state.variables as { chatId?: string };
//       console.log("variables", m, chatId);
//       return variables?.chatId === chatId;
//     },
//   });
//   return mutations.some((m) => m.state.status === "pending");
// };

const useIsStreamingActive = (chatId?: string) =>
  useStreamingStore((state) => {
    if (!chatId) return false;

    const streamingMessage = state.streamingMessages[chatId];
    if (!streamingMessage) return false;

    return ["STARTED", "STREAMING"].includes(streamingMessage.status);
  });

/**
 * useChatStreaming - Manages the core TRPC operations for chat streaming
 *
 * This hook encapsulates:
 * 1. sendWithStream - Primary streaming mutation for new messages
 * 2. listenToMessageChunkStream - Fallback streaming for reconnection
 * 3. abortStream - Stream abortion functionality
 * 4. Stream chunk event emission (no state management)
 *
 * State management is handled by useSyncMessages hook.
 */
export const useChatStreaming = ({
  chatId,
  onChatCreated,
  onStreamChunk,
  utils,
}: UseChatStreamingProps) => {
  const { error } = useNotify();

  // INFO: we might need this in the future. keep it here for now.
  // const mutationCache = queryClient.getMutationCache();
  // const mutation = mutationCache.find({ mutationKey: ['message', 'sendWithStream', chatId] });
  // const isSendMessageMutationPending = mutation?.state.status === "pending";

  const actions = useStreamingStore((state) => state.actions);

  // Streaming update handler - only emits events
  const handleStreamingUpdate = useCallback(
    (chunk: StreamChunk) => {
      // Handle chat creation
      if (chunk.type === "messageStart" && !chatId && chunk.chatId) {
        utils.chat.getAll.invalidate();
        onChatCreated?.({ chatId: chunk.chatId });
      }

      // Emit chunk event to parent
      onStreamChunk?.(chunk);
    },
    [chatId, onChatCreated, utils.chat.getAll, onStreamChunk]
  );

  // Primary streaming mutation
  const sendMessageMutation = trpc.message.sendWithStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the stream
      try {
        for await (const chunk of streamGenerator) {
          handleStreamingUpdate(chunk);

        }
      } catch (err) {
        if (isUserAbortError(err)) return;

        actions.clearStreamingMessage(chatId!);
        console.error("Stream processing error:", err);
        error(`Failed to process stream: ${(err as Error).message}`);
      }
    },
    onError: (err) => {
      // Don't show error if user aborted the stream
      if (!isUserAbortError(err)) {
        error(`Failed to send message: ${err.message}`);
      }
    },
  });

  // Redis stream listening mutation for reconnection scenarios
  const listenToStreamMutation =
    trpc.message.listenToMessageChunkStream.useMutation({
      onSuccess: async (streamGenerator) => {
        // Process the Redis stream
        try {
          for await (const chunk of streamGenerator) {
            // this loads as string
            console.log("listenToStreamMutation success", chunk?.message?.finishedAt);

            handleStreamingUpdate(chunk as StreamChunk);
          }
        } catch (err) {
          console.error("Redis stream listening error:", err);
          // Don't show error if user aborted the stream
          if (!isUserAbortError(err)) {
            error(`Failed to listen to stream: ${(err as Error).message}`);
          }
        }
      },
      onError: (err) => {
        console.error("Failed to listen to Redis stream:", err);
        error(`Failed to listen to stream: ${err.message}`);
      },
    });

  // Abort stream mutation
  const abortStreamMutation = trpc.message.abortStream.useMutation({
    onError: (err) => {
      console.error("Failed to abort stream:", err);
      error(`Failed to abort stream: ${err.message}`);
    },
  });

  // INFO: most probably using only isStreamingStoreStateActive is enough. But just in case using mutation states too.
  // TODO: once we have uuid, we can use it to identify the mutation.
  const isActive = useIsStreamingActive(chatId);

  // Send message function
  const sendMessage = useCallback(
    (content: string, modelId?: string) => {
      if (!content.trim() || isActive) return;

      sendMessageMutation.mutate({
        content: content.trim(),
        chatId,
        modelId,
      });
    },
    [chatId, isActive, sendMessageMutation]
  );

  // Abort stream function
  const abortStream = useCallback(() => {
    if (!chatId) return;

    abortStreamMutation.mutate({ chatId });
  }, [chatId, abortStreamMutation]);

  // Manual sync function to trigger Redis stream listening
  const listenToStream = useCallback(() => {
    if (!chatId || isActive) return;

    listenToStreamMutation.mutate({ chatId });
  }, [chatId, isActive, listenToStreamMutation]);

  return {
    // Mutation objects
    sendMessageMutation,
    listenToStreamMutation,
    abortStreamMutation,

    // Functions
    sendMessage,
    abortStream,
    listenToStream,

    // States
    isActive: isActive,
    isListeningToStream: listenToStreamMutation.isPending,
    isSending: sendMessageMutation.isPending,
    isAborting: abortStreamMutation.isPending,
  };
};
