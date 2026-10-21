"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useTyping } from "@/platform/typing-store";

import { useTypingPresence } from "@/features/typing-presence/context/typing-presence-context";
import { deriveSubtitle } from "@/features/typing-presence/subtitle";
import styles from "@/features/typing-presence/components/HeaderStatusView.module.css";

type Props = {
  conversationType: "direct" | "group";
  otherUserId?: string;
};

export const HeaderStatusView = memo(function HeaderStatusView({
  conversationType,
  otherUserId,
}: Props) {
  const t = useTranslations("typing-presence");
  const { subjectPresence, subjectOnline, viewerId, conversationId } =
    useTypingPresence();
  const typers = useTyping(conversationId, viewerId);

  const subtitle = deriveSubtitle({
    conversationType,
    otherUserId,
    viewerId,
    typers,
    subjectPresence,
    subjectOnline,
  });

  let content: React.ReactNode = null;

  if (subtitle.kind === "typing") {
    content = (
      <span
        className={styles.typing}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {t(subtitle.key, subtitle.values)}
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    );
  } else if (subtitle.kind === "online") {
    content = <span className={styles.online}>{t("online")}</span>;
  } else if (subtitle.kind === "lastSeen" || subtitle.kind === "offline") {
    content = <span className={styles.offline}>{t("offline")}</span>;
  }

  // The root is always rendered with a fixed height so the header never jumps.
  return (
    <span className={styles.root} data-kind={subtitle.kind}>
      {content}
    </span>
  );
});
