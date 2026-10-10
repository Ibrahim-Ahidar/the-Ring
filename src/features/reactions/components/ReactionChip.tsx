"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { emojiCatalogKey } from "../emoji-labels";
import styles from "../reactions.module.css";

type Props = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  onToggle: () => void;
};

function ReactionChipInner({ emoji, count, reactedByMe, onToggle }: Props) {
  const t = useTranslations("reactions");
  const nameKey = emojiCatalogKey(emoji);
  const emojiName = nameKey ? t(nameKey) : emoji;

  return (
    <button
      type="button"
      className={styles.chip}
      data-mine={reactedByMe ? "true" : "false"}
      aria-label={t("chipLabel", { emojiName, count })}
      aria-pressed={reactedByMe}
      onClick={onToggle}
    >
      <span aria-hidden>{emoji}</span>
      {count > 1 ? (
        <span className={styles.chipCount} aria-hidden>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export const ReactionChip = memo(ReactionChipInner);
