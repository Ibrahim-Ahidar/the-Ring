"use client";

import Link from "next/link";
import { Archive } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useMessaging } from "../context/MessagingProvider";
import { parseInboxFilters, isFiltered } from "../lib/inbox-filters";
import styles from "../direct-messaging.module.css";

/**
 * "Archived · n" row at the top of the default chat list. Archive is a place,
 * not a filter: the row opens the archived view and is hidden when there are no
 * archived chats.
 */
export function ArchivedRow() {
  const t = useTranslations("direct-messaging");
  const searchParams = useSearchParams();
  const { state } = useMessaging();
  const { count, unread } = state.archivedSummary;

  const filters = parseInboxFilters({
    archived: searchParams.get("archived") ?? undefined,
    folder: searchParams.get("folder") ?? undefined,
    filter: searchParams.get("filter") ?? undefined,
  });
  if (count < 1 || isFiltered(filters)) {
    return null;
  }

  return (
    <Link
      href="/app/chats?archived=1"
      className={`${styles.chatRow} ${styles.archivedRow}`}
    >
      <span className={styles.archivedIcon} aria-hidden>
        <Archive size={20} />
      </span>
      <span className={styles.archivedLabel}>{t("archived.row", { count })}</span>
      {unread > 0 ? (
        <span
          className={ui.badge}
          aria-label={t("archived.unread", { count: unread })}
        >
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
