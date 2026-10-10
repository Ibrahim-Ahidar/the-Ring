"use client";

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

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

  const actor = row.actorUsername ?? t("unknownActor");

  const title = useMemo(() => {
    if (row.type === "message.created") {
      return t("types.messageCreated", { actor });
    }
    if (row.type === "reaction.created") {
      return t("types.reactionCreated", { actor });
    }
    return t("types.default", { actor });
  }, [actor, row.type, t]);

  const KindIcon =
    row.type === "message.created"
      ? MessageCircle
      : row.type === "reaction.created"
        ? Heart
        : Bell;

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

  const unread = !row.readAt;

  return (
    <li>
      <button
        type="button"
        className={styles.item}
        data-unread={unread ? "true" : "false"}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={t("itemAria", { title, time: timeLabel })}
      >
        <span className={styles.itemIcon}>
          <Avatar name={actor} seed={row.actorUsername ?? row.id} size="md" />
          <span className={styles.itemKind} aria-hidden>
            <KindIcon size={12} strokeWidth={2.5} />
          </span>
        </span>
        <span className={styles.itemBody}>
          <span className={`${styles.itemTitle} bidi-auto`}>{title}</span>
          <span className={styles.itemMeta}>{timeLabel}</span>
        </span>
        {unread ? <span className={ui.dot} aria-hidden /> : null}
      </button>
    </li>
  );
}

export const NotificationRowItem = memo(NotificationRowItemInner);
