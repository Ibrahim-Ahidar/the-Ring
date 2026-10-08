import type { AllowedReactionEmoji } from "./types";

const EMOJI_LABEL_KEYS: Record<AllowedReactionEmoji, string> = {
  "👍": "emojiThumbsUp",
  "❤️": "emojiHeart",
  "😂": "emojiLaugh",
  "😮": "emojiSurprised",
  "😢": "emojiSad",
  "🙏": "emojiThanks",
};

export function emojiCatalogKey(emoji: string): string | null {
  return EMOJI_LABEL_KEYS[emoji as AllowedReactionEmoji] ?? null;
}
