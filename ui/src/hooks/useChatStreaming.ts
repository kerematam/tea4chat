import { useCallback, useState } from "react";
import { isUserAbortError } from "../../../server/src/lib/errors";
import { useNotify } from "../providers/NotificationProdiver/useNotify";
import { trpc } from "../services/trpc";
import { MessageType, StreamChunk } from "./useChatMessages";

interface UseChatStreamingProps {
  chatId?: string;
  onChatCreated?: ({ chatId }: { chatId: string }) => void;
  chunkHandlers?: {
    userMessage?: (message: MessageType) => void;
    aiMessageStart?: (message: MessageType) => void;
    aiMessageChunk?: (messageId: string, fullContent: string, chatId: string) => void;
    aiMessageComplete?: (message: MessageType) => void;
  };
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
 * 4. streamingMessages - In-memory streaming state management
 * 5. handleStreamingUpdate - Stream chunk processing
 * 
 * Extracted from useChatMessages for better separation of concerns.
 */
export const useChatStreaming = ({
  chatId,
  onChatCreated,
  chunkHandlers,
  utils,
  onStreamEnd,
  onStreamingStateChange,
}: UseChatStreamingProps) => {
  const { error } = useNotify();

  // Streaming state - separate from query cache
  const [streamingMessages, setStreamingMessages] = useState<Map<string, MessageType>>(new Map());
  // console.log("streamingMessages", streamingMessages);

  // Streaming update handler - manages streaming state
  const handleStreamingUpdate = useCallback((chunk: StreamChunk) => {
    switch (chunk.type) {
      case "userMessage":
        // If this is a new chat creation, notify parent
        if (!chatId && chunk.chatId) {
          utils.chat.getAll.invalidate();
          onChatCreated?.({ chatId: chunk.chatId });
        }

        // Add user message to streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.userMessage?.(chunk.message as MessageType);
        break;

      case "aiMessageStart":
        // Add AI message to streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.aiMessageStart?.(chunk.message as MessageType);
        break;

      case "aiMessageChunk": {
        let fullContent = "";

        // Update the AI message in streaming state
        setStreamingMessages(prev => {
          const existingMessage = prev.get(chunk.messageId);
          if (existingMessage) {
            const newMap = new Map(prev);
            // Accumulate the chunk content from existing message content
            const currentContent = existingMessage.content || "";
            fullContent = currentContent + chunk.chunk;
            const updatedMessage = {
              ...existingMessage,
              content: fullContent,
              text: fullContent,
            };
            newMap.set(chunk.messageId, updatedMessage);
            return newMap;
          }
          return prev;
        });

        chunkHandlers?.aiMessageChunk?.(chunk.messageId, fullContent, chunk.chatId);
        break;
      }

      case "aiMessageComplete":
        // Update with final complete message in streaming state
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(chunk.message.id, chunk.message);
          return newMap;
        });
        chunkHandlers?.aiMessageComplete?.(chunk.message as MessageType);
        break;

      default:
        // Handle unexpected chunk types gracefully
        console.warn("Unknown stream chunk type:", chunk);
        break;
    }
  }, [chatId, onChatCreated, utils.chat.getAll, chunkHandlers]);

  // Clear streaming messages helper
  const clearStreamingMessages = useCallback(() => {
    setStreamingMessages(new Map());
  }, []);

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
        clearStreamingMessages();
        onStreamEnd?.();
      }
    },
    onError: (err) => {
      clearStreamingMessages();
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
        clearStreamingMessages();
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
        clearStreamingMessages();
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
    // Streaming state
    streamingMessages,

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

    // Streaming handler (still exposed for legacy compatibility if needed)
    handleStreamingUpdate,
  };
}; 