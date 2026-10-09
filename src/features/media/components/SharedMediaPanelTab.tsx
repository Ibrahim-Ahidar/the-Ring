"use client";

import { memo } from "react";
import Link from "next/link";
import { Images } from "lucide-react";
import { useTranslations } from "next-intl";

import styles from "../media.module.css";

type Props = {
  conversationId: string;
};

function SharedMediaPanelTabInner({ conversationId }: Props) {
  const t = useTranslations("media");

  return (
    <Link
      href={`/app/media/${conversationId}`}
      className={styles.tabLink}
      aria-label={t("sharedMediaLink")}
    >
      <Images size={16} aria-hidden /> {t("sharedMedia")}
    </Link>
  );
}

export const SharedMediaPanelTab = memo(SharedMediaPanelTabInner);
