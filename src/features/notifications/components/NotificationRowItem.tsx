"use client";

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import type { NotificationRow } from "../types";
import styles from "./notifications.module.css";

type Props = {
  row: NotificationRow;
  tabIndex: number;
  onFocus: () => void;
  onActivate: (id: string) => void;
};

function formatRelativeTime(iso: string, locale: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffSec = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) {
    return rtf.format(diffSec, "second");
  }
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, "minute");
  }
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 48) {
    return rtf.format(diffHour, "hour");
  }
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, "day");
}

function NotificationRowItemInner({
  row,
  tabIndex,
  onFocus,
  onActivate,
}: Props) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();

  const href = useMemo(() => {
    if (row.conversationId) {
      return `/app/chats/${row.conversationId}`;
    }
    if (row.actorUsername) {
      return `/app/profile/${row.actorUsername}`;
    }
    return null;
  }, [row.actorUsername, row.conversationId]);

  const title = useMemo(() => {
    const actor = row.actorUsername ?? t("unknownActor");
    if (row.type === "message.created") {
      return t("types.messageCreated", { actor });
    }
    if (row.type === "reaction.created") {
      return t("types.reactionCreated", { actor });
    }
    return t("types.default", { actor });
  }, [row.actorUsername, row.type, t]);

  const timeLabel = useMemo(
    () => formatRelativeTime(row.createdAt, locale),
    [row.createdAt, locale],
  );

  const handleClick = useCallback(() => {
    onActivate(row.id);
    if (href) {
      router.push(href);
    }
  }, [href, onActivate, row.id, router]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.itemButton}
        data-unread={row.readAt ? "false" : "true"}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={t("itemAria", { title, time: timeLabel })}
      >
        <span className={styles.itemTitle}>{title}</span>
        <span className={styles.itemMeta}>{timeLabel}</span>
      </button>
    </li>
  );
}

export const NotificationRowItem = memo(NotificationRowItemInner);
