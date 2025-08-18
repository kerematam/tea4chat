import { create } from "zustand";
import type { MessageType } from "../types";
import { StreamChunk } from "./useChatMessages";

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
      console.error(`DEBUG: Clearing streaming message for chatId: ${chatId}`);
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
          break;

        default:
          break;
      }
    },
  },
}));
