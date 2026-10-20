import type { MessageReaction } from "@pulse/core/timeline";

export type ReactionRow = MessageReaction;

export const ALLOWED_REACTION_EMOJI = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
] as const;

export type AllowedReactionEmoji = (typeof ALLOWED_REACTION_EMOJI)[number];

export function isAllowedReactionEmoji(value: string): value is AllowedReactionEmoji {
  return (ALLOWED_REACTION_EMOJI as readonly string[]).includes(value);
}
