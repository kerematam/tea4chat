import { create } from "zustand";
import { MessageType, StreamChunk } from "../hooks/useChatMessages";

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
  };
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessages: {},

  actions: {
    setStreamingMessages: (chatId: string, messages: MessageType[]) => {
      console.log("setStreamingMessages called", { chatId, messages });
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: messages,
        },
      }));
    },

    addStreamingMessage: (chatId: string, message: MessageType) => {
      console.log("addStreamingMessage called", { chatId, message });
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
      console.log("updateStreamingMessage called", { chatId, messageId });
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
      console.log("clearStreamingMessages called", { chatId });
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: [],
        },
      }));
    },

    handleStreamChunk: (_chatId: string, chunk: StreamChunk) => {
      console.log("handleStreamChunk called", { _chatId, chunk });
      const { actions } = get();
      const chatId = chunk.chatId;
      switch (chunk.type) {
        case "userMessage":
          console.log("event: userMessage", chunk);
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageStart":
          console.log("event: aiMessageStart", chunk);
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageChunk":
          console.log("event: aiMessageChunk", chunk);
          actions.updateStreamingMessage(chatId, chunk.messageId, (msg) => ({
            ...msg,
            content: (msg.content || "") + chunk.chunk,
          }));
          break;

        case "aiMessageComplete":
          console.log("event: aiMessageComplete", chunk);
          actions.updateStreamingMessage(chatId, chunk.message.id, () => chunk.message);
          break;

        default:
          console.log("event: unknown", chunk);
          console.warn("Unknown stream chunk type:", chunk);
          break;
      }
    },
  },
}));
