import { useCallback } from "react";
import { useNotify } from "../providers/NotificationProdiver/useNotify";
import { trpc } from "../services/trpc";
import { isUserAbortError } from "../utils";
import { StreamChunk } from "./useChatMessages";

interface UseChatStreamingProps {
  chatId?: string;
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
  onStreamChunk?: (chunk: StreamChunk) => void;
  utils: ReturnType<typeof trpc.useUtils>; // TRPC utils for invalidating chat list
  onStreamEnd?: () => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
}

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
  onStreamEnd,
  onStreamingStateChange,
}: UseChatStreamingProps) => {
  const { error } = useNotify();

  // No state management - only event emission

  // Streaming update handler - only emits events
  const handleStreamingUpdate = useCallback((chunk: StreamChunk) => {
    // Handle chat creation
    if (chunk.type === "userMessage" && !chatId && chunk.chatId) {
      utils.chat.getAll.invalidate();
      onChatCreated?.({ chatId: chunk.chatId });
    }

    // Emit chunk event to parent
    onStreamChunk?.(chunk);
  }, [chatId, onChatCreated, utils.chat.getAll, onStreamChunk]);


  // Primary streaming mutation
  const sendMessageMutation = trpc.message.sendWithStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the stream
      try {
        for await (const chunk of streamGenerator) {
          handleStreamingUpdate(chunk);
        }
      } catch (err) {
        console.error("Stream processing error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to process stream: ${(err as Error).message}`);
        }
      } finally {
        // Stream ended
        // clearStreamingMessages();
        // INFO: this is hack to clear streaming messages after 1 second
        // setTimeout(() => {
        //   clearStreamingMessages();
        // }, 1000);

        onStreamEnd?.();
      }
    },
    onError: (err) => {
      onStreamingStateChange?.(false);
      // Don't show error if user aborted the stream
      if (!isUserAbortError(err)) {
        error(`Failed to send message: ${err.message}`);
      }
    },
  });

  // Redis stream listening mutation for reconnection scenarios
  const listenToStreamMutation = trpc.message.listenToMessageChunkStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the Redis stream
      try {
        for await (const chunk of streamGenerator) {
          handleStreamingUpdate(chunk as StreamChunk);
        }
      } catch (err) {
        console.error("Redis stream listening error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to listen to stream: ${(err as Error).message}`);
        }
      } finally {
        // console.log("listenToStreamMutation finally");
        // Stream listening ended
        // clearStreamingMessages();
        // INFO: this is hack to clear streaming messages after 1 second
        // setTimeout(() => {
        //   clearStreamingMessages();
        // }, 1000);

        onStreamEnd?.();
      }
    },
    onError: (err) => {
      console.error("Failed to listen to Redis stream:", err);
      error(`Failed to listen to stream: ${err.message}`);
    },
  });

  // Abort stream mutation
  const abortStreamMutation = trpc.message.abortStream.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        onStreamingStateChange?.(false);
      }
    },
    onError: (err) => {
      console.error("Failed to abort stream:", err);
      error(`Failed to abort stream: ${err.message}`);
    },
  });

  // Send message function
  const sendMessage = useCallback((content: string, modelId?: string) => {
    if (!content.trim() || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      content: content.trim(),
      chatId,
      modelId,
    });
  }, [chatId, sendMessageMutation]);

  // Abort stream function
  const abortStream = useCallback(() => {
    if (!chatId) return;

    abortStreamMutation.mutate({ chatId, });
  }, [chatId, abortStreamMutation]);


  // Manual sync function to trigger Redis stream listening
  const listenToStream = useCallback((fromTimestamp?: string) => {
    if (!chatId || listenToStreamMutation.isPending || sendMessageMutation.isPending) return;

    listenToStreamMutation.mutate({
      chatId,
      ...(fromTimestamp && { fromTimestamp })
    });
  }, [chatId, listenToStreamMutation, sendMessageMutation.isPending]);

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
    isStreamingActive: sendMessageMutation.isPending || listenToStreamMutation.isPending,
    isListeningToStream: listenToStreamMutation.isPending,
    isSending: sendMessageMutation.isPending,
    isAborting: abortStreamMutation.isPending,
  };
}; 