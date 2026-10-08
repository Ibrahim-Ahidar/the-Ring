"use client";

import { memo, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

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

function formatLastSeen(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const HeaderStatusView = memo(function HeaderStatusView({
  conversationType,
  otherUserId,
}: Props) {
  const t = useTranslations("typing-presence");
  const locale = useLocale();
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
      return (
        <span className={styles.presenceRow}>
          <span
            className={styles.onlineDot}
            aria-hidden="true"
          />
          <span>{t("online")}</span>
        </span>
      );
    }

    if (
      presenceVisibility.showLastSeen &&
      subjectPresence.last_seen_at
    ) {
      return (
        <span className={styles.presenceRow}>
          <span>
            {t("lastSeen", {
              when: formatLastSeen(subjectPresence.last_seen_at, locale),
            })}
          </span>
        </span>
      );
    }

    return null;
  }, [
    conversationType,
    locale,
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
    <div className={styles.root}>
      {presenceLine}
      {typingLabel ? (
        <span
          className={styles.typing}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {typingLabel}
        </span>
      ) : null}
    </div>
  );
});
