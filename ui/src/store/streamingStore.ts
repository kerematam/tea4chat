import { create } from "zustand";
import { MessageType, StreamChunk } from "../hooks/useChatMessages";
import { queryClient } from "@/services/queryClient";
import { InfiniteData } from "@tanstack/react-query";

interface StreamingState {
  streamingMessages: Record<string, MessageType[]>;
  actions: {
    setStreamingMessages: (chatId: string, messages: MessageType[]) => void;
    addStreamingMessage: (chatId: string, message: MessageType) => void;
    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => void;
    clearStreamingMessages: (chatId: string) => void;
    handleStreamChunk: (chatId: string, chunk: StreamChunk) => void;
    commitStreamingMessagesToQueryCache: (chatId: string) => void;
  };
}



export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessages: {},

  actions: {
    setStreamingMessages: (chatId: string, messages: MessageType[]) => {
      console.log("setStreamingMessages called", { chatId, messages });
      if (!chatId) return;
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: messages,
        },
      }));
    },

    addStreamingMessage: (chatId: string, message: MessageType) => {
      console.log("addStreamingMessage called", { chatId, message });
      if (!chatId) return;

      set((state) => {
        const currentMessages = state.streamingMessages[chatId] || [];
        const exists = currentMessages.some((msg) => msg.id === message.id);
        if (exists) return state;

        return {
          streamingMessages: {
            ...state.streamingMessages,
            [chatId]: [...currentMessages, message],
          },
        };
      });
    },

    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => {
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: (state.streamingMessages[chatId] || []).map((msg) =>
            msg.id === messageId ? updater(msg) : msg
          ),
        },
      }));
    },

    clearStreamingMessages: (chatId: string) => {
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: [],
        },
      }));
    },

    commitStreamingMessagesToQueryCache: (chatId: string) => {
      if (!chatId) return;

      const messages = get().streamingMessages[chatId];
      if (!messages || messages.length === 0) return;

      const queryKey = [["message", "getMessages"], { "input": { "chatId": chatId }, "type": "infinite" }];
      
      queryClient.setQueriesData<InfiniteData<any> | undefined>(
        {
          queryKey,
          exact: false
        },
        (oldData) => {
          console.log("oldData", oldData);
          console.log("streaming messages to add", messages);
          
          if (!oldData) return oldData;
          if (!messages || messages.length === 0) return oldData;

          // Create a Set of existing message IDs across all pages to prevent duplicates
          const existingMessageIds = new Set<string>();
          oldData.pages.forEach(page => {
            page.messages?.forEach((msg: MessageType) => {
              existingMessageIds.add(msg.id);
            });
          });

          // Filter out messages that already exist in the cache
          const newMessages = messages.filter(msg => !existingMessageIds.has(msg.id));
          
          if (newMessages.length === 0) {
            console.log("No new messages to add - all messages already exist in cache");
            return oldData; // No new messages to add
          }

          // Create a new page with only the new streaming messages
          const newPage = {
            messages: newMessages,
            direction: "forward",
            syncDate: newMessages[newMessages.length - 1].createdAt,
            streamingMessage: null
          };

          // Update pageParams - add the latest message's createdAt to the beginning
          const latestMessageDate = newMessages[newMessages.length - 1].createdAt;
          const updatedPageParams = [latestMessageDate, ...oldData.pageParams];

          return {
            ...oldData,
            pages: [newPage, ...oldData.pages],
            pageParams: updatedPageParams
          };
        }
      );
    },

    handleStreamChunk: (_chatId: string, chunk: StreamChunk) => {
      const { actions } = get();
      const chatId = chunk.chatId;
      switch (chunk.type) {
        case "userMessage":
          actions.clearStreamingMessages(chatId);
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageStart":
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageChunk":
          actions.updateStreamingMessage(chatId, chunk.messageId, (msg) => ({
            ...msg,
            content: (msg.content || "") + chunk.chunk,
          }));
          break;

        case "aiMessageComplete":
          actions.updateStreamingMessage(chatId, chunk.message.id, () => chunk.message);
          actions.commitStreamingMessagesToQueryCache(chatId);
          actions.clearStreamingMessages(chatId);
          break;

        default:
          console.warn("Unknown stream chunk type:", chunk);
          break;
      }
    },
  },
}));
