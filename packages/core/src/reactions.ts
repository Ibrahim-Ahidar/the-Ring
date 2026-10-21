import { ok, type Result } from "./result";
import { callRpc, type RpcClient } from "./rpc";
import type { MessageReaction } from "./timeline";

export const ALLOWED_REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export function isAllowedReactionEmoji(value: string): boolean {
  return (ALLOWED_REACTION_EMOJI as readonly string[]).includes(value);
}

export type ReactionGroup = { emoji: string; count: number; mine: boolean };

/** Groups per emoji in the allowed order; `mine` marks the viewer's own reaction. */
export function groupReactions(
  reactions: readonly MessageReaction[],
  viewerId: string,
): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count += 1;
    if (r.user_id === viewerId) g.mine = true;
    groups.set(r.emoji, g);
  }
  const order = ALLOWED_REACTION_EMOJI as readonly string[];
  const rank = (e: string) => {
    const i = order.indexOf(e);
    return i < 0 ? order.length : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.emoji) - rank(b.emoji));
}

/** Tapping an emoji adds it, or removes it when the viewer already reacted with it. */
export function reactionToggle(
  reactions: readonly MessageReaction[],
  viewerId: string,
  emoji: string,
): "add" | "remove" {
  return reactions.some((r) => r.user_id === viewerId && r.emoji === emoji) ? "remove" : "add";
}

export function addReaction(
  rpc: RpcClient,
  input: { messageId: string; emoji: string },
): Promise<Result<unknown>> {
  return callRpc<unknown>(rpc, "add_reaction", {
    p_message_id: input.messageId,
    p_emoji: input.emoji,
  });
}

export function removeReaction(
  rpc: RpcClient,
  input: { messageId: string; emoji: string },
): Promise<Result<unknown>> {
  return callRpc<unknown>(rpc, "remove_reaction", {
    p_message_id: input.messageId,
    p_emoji: input.emoji,
  });
}

export async function listReactions(
  rpc: RpcClient,
  input: { conversationId: string; messageIds: string[] },
): Promise<Result<MessageReaction[]>> {
  if (input.messageIds.length === 0) return ok([]);
  const result = await callRpc<MessageReaction[] | MessageReaction | null>(rpc, "list_reactions", {
    p_conversation_id: input.conversationId,
    p_message_ids: input.messageIds,
  });
  if (!result.ok) return result;
  const v = result.value;
  return ok(v == null ? [] : Array.isArray(v) ? v : [v]);
}
