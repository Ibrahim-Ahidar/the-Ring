import type { RpcMessageRow } from "@/features/direct-messaging/types";

export type MessageActionRow = RpcMessageRow;

export type ForwardInput = {
  sourceMessageId: string;
  targetConversationId: string;
  clientId: string;
};
