import { MessageType as ServerMessageType } from "../../../server/src/router/messageRouter";

// Align date fields with serialized API payloads (strings on the client)
export type MessageType = Omit<ServerMessageType, "createdAt" | "finishedAt"> & {
  createdAt: string;
  finishedAt: string | null;
};