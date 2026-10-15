"use client";

import { memo, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { useTyping } from "@/platform/typing-store";

import { useTypingPresence } from "@/features/typing-presence/context/typing-presence-context";
import {
  deriveSubtitle,
  lastSeenBucket,
} from "@/features/typing-presence/subtitle";
import styles from "@/features/typing-presence/components/HeaderStatusView.module.css";

type Props = {
  conversationType: "direct" | "group";
  otherUserId?: string;
};

const LAST_SEEN_TICK_MS = 60_000;

/** Re-renders once a minute while `active`, so relative times stay fresh. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), LAST_SEEN_TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export const HeaderStatusView = memo(function HeaderStatusView({
  conversationType,
  otherUserId,
}: Props) {
  const t = useTranslations("typing-presence");
  const format = useFormatter();
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
  const now = useNow(subtitle.kind === "lastSeen");

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
  } else if (subtitle.kind === "lastSeen") {
    const nowDate = new Date(now);
    const bucket = lastSeenBucket(subtitle.at, nowDate);
    content = (
      <span>
        {bucket === "justNow"
          ? t("lastSeenJustNow")
          : bucket === "relative"
            ? t("lastSeenRelative", {
                when: format.relativeTime(subtitle.at, nowDate),
              })
            : t("lastSeen", {
                when: format.dateTime(subtitle.at, { dateStyle: "medium" }),
              })}
      </span>
    );
  }

  // The root is always rendered with a fixed height so the header never jumps.
  return (
    <span className={styles.root} data-kind={subtitle.kind}>
      {content}
    </span>
  );
});
