import {
  addReaction,
  deleteForEveryone,
  editMessage,
  listReactions,
  removeReaction,
  type MessageReaction,
  type Result,
  type TimelineMessage,
} from "@pulse/core";

import { rpcClient } from "./rpc";

export function editChatMessage(messageId: string, body: string): Promise<Result<TimelineMessage>> {
  return editMessage(rpcClient, { messageId, body });
}

export function deleteChatMessageForEveryone(messageId: string): Promise<Result<TimelineMessage>> {
  return deleteForEveryone(rpcClient, { messageId });
}

export function addChatReaction(messageId: string, emoji: string): Promise<Result<unknown>> {
  return addReaction(rpcClient, { messageId, emoji });
}

export function removeChatReaction(messageId: string, emoji: string): Promise<Result<unknown>> {
  return removeReaction(rpcClient, { messageId, emoji });
}

export function listChatReactions(
  conversationId: string,
  messageIds: string[],
): Promise<Result<MessageReaction[]>> {
  return listReactions(rpcClient, { conversationId, messageIds });
}
