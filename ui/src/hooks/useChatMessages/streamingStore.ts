import { queryClient } from "@/services/queryClient";
import type { InfiniteData } from "@tanstack/react-query";
import type { inferProcedureOutput } from "@trpc/server";
import { create } from "zustand";
import type { AppRouter } from "../../../../server/src/router";
import type { MessageType } from "../../../../server/src/router/messageRouter";
import { StreamChunk } from "./useChatMessages";

// Type for the getMessages procedure output
type GetMessagesOutput = inferProcedureOutput<
  AppRouter["message"]["getMessages"]
>;

// Type for the infinite query data structure
type MessagesInfiniteData = InfiniteData<GetMessagesOutput>;

interface StreamingState {
  streamingMessages: Record<string, MessageType | null>;
  actions: {
    setStreamingMessage: (chatId: string, message: MessageType | null) => void;
    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => void;
    clearStreamingMessage: (chatId: string) => void;
    handleStreamChunk: (chatId: string, chunk: StreamChunk) => void;
    onStreamEnd: (chatId: string) => void;
  };
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessages: {} as Record<string, MessageType | null>,

  actions: {
    setStreamingMessage: (chatId: string, message: MessageType | null) => {
      if (!chatId) return;
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: message,
        },
      }));
    },

    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => {
      set((state) => {
        const currentMessage = state.streamingMessages[chatId];
        if (!currentMessage || currentMessage.id !== messageId) {
          return state;
        }

        return {
          streamingMessages: {
            ...state.streamingMessages,
            [chatId]: updater(currentMessage),
          },
        };
      });
    },

    clearStreamingMessage: (chatId: string) => {
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: null,
        },
      }));
    },

    handleStreamChunk: (_chatId: string, chunk: StreamChunk) => {
      const { actions } = get();
      const chatId = chunk.chatId;
      switch (chunk.type) {
        case "messageStart":
          actions.setStreamingMessage(chatId, chunk.message);
          break;

        case "agentChunk":
          actions.updateStreamingMessage(chatId, chunk.messageId, (msg) => ({
            ...msg,
            agentContent: (msg.agentContent || "") + chunk.chunk,
          }));
          break;

        case "messageComplete":
          actions.updateStreamingMessage(
            chatId,
            chunk.message.id,
            () => chunk.message
          );
          actions.onStreamEnd(chatId);
          break;

        default:
          break;
      }
    },

    onStreamEnd: (chatId: string) => {
      if (!chatId) return;

      const streamingMessage = get().streamingMessages[chatId];
      if (!streamingMessage || !streamingMessage.finishedAt) return;

      // Find the infinite query for this chatId using partial matching
      const partialQueryKey = [
        ["message", "getMessages"],
        {
          input: { chatId },
          type: "infinite",
        },
      ];

      // Get matching queries using partial matching
      const matchingQueries = queryClient.getQueriesData({
        queryKey: partialQueryKey,
        exact: false,
      });

      const [matchingQueryKey, currentData] = matchingQueries[0];
      const isValid =
        currentData &&
        typeof currentData === "object" &&
        "pages" in currentData;

      if (!isValid) return;

      // Type the current data properly using tRPC types
      const infiniteData = currentData as MessagesInfiniteData;
      // Create a new page with the completed message
      const newPage = {
        messages: [streamingMessage],
        syncDate: streamingMessage.finishedAt,
        direction: "backward" as const, // backward means newer
        streamingMessage: null,
      } as MessagesInfiniteData["pages"][number];

      // Add the new page at the beginning (newest messages first)
      const updatedData = {
        ...infiniteData,
        pages: [newPage, ...infiniteData.pages],
        pageParams: [
          streamingMessage.finishedAt!.toISOString(),
          ...infiniteData.pageParams,
        ],
      } as MessagesInfiniteData;

      // Update the query cache with the new data using the actual query key from the match
      // const actualQueryKey = matchingQueries[0]?.[0];
      if (matchingQueryKey) {
        queryClient.setQueryData(matchingQueryKey, updatedData);
      }

      get().actions.clearStreamingMessage(chatId);
    },
  },
}));
