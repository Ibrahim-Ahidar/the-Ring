"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";

import { useMessaging } from "../context/MessagingProvider";
import type { ConversationSummary } from "../types";
import styles from "../direct-messaging.module.css";

type Props = {
  activeConversationId?: string;
};

function displayTitle(item: ConversationSummary): string {
  if (item.type === "group") {
    return item.title ?? item.id;
  }
  return item.other_display_name ?? item.other_username ?? item.id;
}

function previewText(
  item: ConversationSummary,
  t: ReturnType<typeof useTranslations>,
): string {
  if (item.last_message_deletion_scope === "everyone") {
    return t("messageDeleted");
  }
  return item.last_message_preview ?? t("noPreview");
}

function ConversationListInner({ activeConversationId }: Props) {
  const t = useTranslations("direct-messaging");
  const format = useFormatter();
  const { state } = useMessaging();
  const menus = useMemo(() => getContributions("listItemMenu"), []);

  if (state.conversations.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t("emptyList")}</p>
        <Link href="/app/chats/new">{t("startChat")}</Link>
      </div>
    );
  }

  return (
    <div className={styles.listScroll}>
      {state.conversations.map((item) => {
        const title = displayTitle(item);
        const time = item.last_message_at
          ? format.dateTime(new Date(item.last_message_at), {
              hour: "numeric",
              minute: "numeric",
            })
          : null;
        const menuCtx = {
          conversationId: item.id,
          conversationType: item.type,
          membership: {
            pinned_at: item.pinned_at,
            muted_until: item.muted_until,
            archived_at: item.archived_at,
          },
        };
        return (
          <Link
            key={item.id}
            href={`/app/chats/${item.id}`}
            className={styles.listItem}
            data-active={item.id === activeConversationId ? "true" : "false"}
          >
            <div className={styles.avatar} aria-hidden>
              {(title[0] ?? "?").toUpperCase()}
            </div>
            <div className={styles.listBody}>
              <div className={styles.listTitleRow}>
                <strong>{title}</strong>
                {time ? <span className={styles.listPreview}>{time}</span> : null}
              </div>
              <p className={styles.listPreview}>{previewText(item, t)}</p>
            </div>
            {item.unread_count > 0 ? (
              <span className={styles.badge} aria-label={t("unreadCount", { count: item.unread_count })}>
                {item.unread_count}
              </span>
            ) : null}
            <div className={styles.toolsRow}>
              {menus
                .filter((menu) => menu.isAvailable(menuCtx))
                .map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    aria-label={menu.labelKey}
                    onClick={(event) => {
                      event.preventDefault();
                      void menu.run(menuCtx);
                    }}
                  >
                    {menu.labelKey}
                  </button>
                ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export const ConversationList = memo(ConversationListInner);
