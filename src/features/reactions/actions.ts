"use server";

import { getSessionContext } from "@/platform/session";

import { addReaction, listReactions, removeReaction } from "./service";

export async function addReactionAction(input: {
  messageId: string;
  emoji: string;
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return addReaction(session.rpc, {
    messageId: input.messageId,
    emoji: input.emoji,
  });
}

export async function removeReactionAction(input: {
  messageId: string;
  emoji: string;
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return removeReaction(session.rpc, {
    messageId: input.messageId,
    emoji: input.emoji,
  });
}

export async function listReactionsAction(input: {
  conversationId: string;
  messageIds: string[];
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listReactions(session.rpc, input);
}
