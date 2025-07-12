import { useCallback } from "react";
import { isUserAbortError } from "../../../server/src/lib/errors";
import { useNotify } from "../providers/NotificationProdiver/useNotify";
import { trpc } from "../services/trpc";
import { StreamChunk } from "./useChatMessages";

interface UseChatStreamingProps {
  chatId?: string;
  onStreamChunk: (chunk: StreamChunk) => void;
  onStreamEnd: () => void;
  onStreamingStateChange: (isStreaming: boolean) => void;
}

/**
 * useChatStreaming - Manages the core TRPC operations for chat streaming
 * 
 * This hook encapsulates:
 * 1. sendWithStream - Primary streaming mutation for new messages
 * 2. listenToMessageChunkStream - Fallback streaming for reconnection
 * 3. abortStream - Stream abortion functionality
 * 
 * Extracted from useChatMessages for better separation of concerns.
 */
export const useChatStreaming = ({
  chatId,
  onStreamChunk,
  onStreamEnd,
  onStreamingStateChange,
}: UseChatStreamingProps) => {
  const { error } = useNotify();

  // Primary streaming mutation
  const sendMessageMutation = trpc.message.sendWithStream.useMutation({
    onSuccess: async (streamGenerator) => {
      // Process the stream
      try {
        for await (const chunk of streamGenerator) {
          onStreamChunk(chunk);
        }
      } catch (err) {
        console.error("Stream processing error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to process stream: ${(err as Error).message}`);
        }
      } finally {
        // Stream ended
        onStreamEnd();
      }
    },
    onError: (err) => {
      onStreamingStateChange(false);
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
          onStreamChunk(chunk as StreamChunk);
        }
      } catch (err) {
        console.error("Redis stream listening error:", err);
        // Don't show error if user aborted the stream
        if (!isUserAbortError(err)) {
          error(`Failed to listen to stream: ${(err as Error).message}`);
        }
      } finally {
        // Stream listening ended
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
        onStreamingStateChange(false);
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
    if (!chatId || !sendMessageMutation.isPending) return;

    abortStreamMutation.mutate({
      chatId,
    });
  }, [chatId, sendMessageMutation.isPending, abortStreamMutation]);

  // Manual sync function to trigger Redis stream listening
  const listenToStream = useCallback((fromTimestamp?: string) => {
    if (!chatId || listenToStreamMutation.isPending) return;

    listenToStreamMutation.mutate({
      chatId,
      ...(fromTimestamp && { fromTimestamp })
    });
  }, [chatId, listenToStreamMutation]);

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