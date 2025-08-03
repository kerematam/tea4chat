import { MessageType as ServerMessageType } from "../../../server/src/router/messageRouter";

// override createdAt type
export type MessageType = Omit<ServerMessageType, "createdAt"> & {
  createdAt: string;
};