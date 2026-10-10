"use client";

import { memo, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { canShowPresence } from "@/features/typing-presence/presence";
import { useTypingPresence } from "@/features/typing-presence/context/typing-presence-context";
import {
  typerCount,
  visibleTypers,
} from "@/features/typing-presence/typing-reducer";
import styles from "@/features/typing-presence/components/HeaderStatusView.module.css";

type Props = {
  conversationType: "direct" | "group";
  otherUserId?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(date: Date, now: Date): number {
  const start = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(date)) / DAY_MS);
}

export const HeaderStatusView = memo(function HeaderStatusView({
  conversationType,
  otherUserId,
}: Props) {
  const t = useTranslations("typing-presence");
  const format = useFormatter();
  const { typing, subjectPresence, subjectOnline, viewerId } =
    useTypingPresence();
  const now = Date.now();
  const typers = visibleTypers(typing, now, viewerId ?? undefined);
  const count = typerCount(typing, now, viewerId ?? undefined);

  const typingLabel = useMemo(() => {
    if (count === 0) {
      return null;
    }
    if (count === 1) {
      const name = typers[0]?.displayName ?? "";
      return t("typingOne", { name });
    }
    return t("typingMany", { count });
  }, [count, t, typers]);

  const presenceVisibility = canShowPresence(
    subjectPresence?.presence_allowed ? "allow" : "deny",
    subjectPresence?.show_last_seen ?? false,
  );

  const presenceLine = useMemo(() => {
    if (conversationType !== "direct" || !otherUserId || !subjectPresence) {
      return null;
    }
    if (presenceVisibility.showOnline && subjectOnline) {
      return <span className={styles.online}>{t("online")}</span>;
    }
    if (presenceVisibility.showLastSeen && subjectPresence.last_seen_at) {
      const seen = new Date(subjectPresence.last_seen_at);
      const time = format.dateTime(seen, { timeStyle: "short" });
      const ago = daysAgo(seen, new Date());
      const label =
        ago === 0
          ? t("lastSeenToday", { time })
          : ago === 1
            ? t("lastSeenYesterday", { time })
            : t("lastSeen", {
                when: format.dateTime(seen, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              });
      return <span>{label}</span>;
    }
    return null;
  }, [
    conversationType,
    format,
    otherUserId,
    presenceVisibility.showLastSeen,
    presenceVisibility.showOnline,
    subjectOnline,
    subjectPresence,
    t,
  ]);

  if (!typingLabel && !presenceLine) {
    return null;
  }

  return (
    <span className={styles.root}>
      {typingLabel ? (
        <span
          className={styles.typing}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {typingLabel}
        </span>
      ) : (
        presenceLine
      )}
    </span>
  );
});
