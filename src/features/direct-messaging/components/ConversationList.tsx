"use client";

import Link from "next/link";
import { Ban, BellOff, Pin } from "lucide-react";
import { memo, useMemo } from "react";
import { useFormatter, useNow, useTimeZone, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Avatar } from "@/shell/components/Avatar";
import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { useMessaging } from "../context/MessagingProvider";
import { useQueryHref } from "../hooks/useQueryHref";
import { calendarDaysAgo } from "../lib/calendar";
import { useHydrated } from "../lib/use-hydrated";
import type { ConversationSummary } from "../types";
import styles from "../direct-messaging.module.css";

type Props = {
  activeConversationId?: string;
};

type Formatter = ReturnType<typeof useFormatter>;
type Translator = ReturnType<typeof useTranslations>;

function displayTitle(item: ConversationSummary): string {
  if (item.type === "group") {
    return item.title ?? item.id;
  }
  return item.other_display_name ?? item.other_username ?? item.id;
}

function previewText(item: ConversationSummary, t: Translator): string {
  if (item.last_message_deletion_scope === "everyone") {
    return t("messageDeleted");
  }
  return item.last_message_preview ?? t("noPreview");
}

function listTime(
  iso: string,
  now: Date,
  timeZone: string,
  format: Formatter,
  t: Translator,
): string {
  const date = new Date(iso);
  const daysAgo = calendarDaysAgo(date, now, timeZone);
  if (daysAgo <= 0) {
    return format.dateTime(date, { hour: "numeric", minute: "numeric" });
  }
  if (daysAgo === 1) {
    return t("yesterday");
  }
  if (daysAgo < 7) {
    return format.dateTime(date, { weekday: "long" });
  }
  return format.dateTime(date, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isMuted(item: ConversationSummary, now: Date): boolean {
  return item.muted_until !== null && new Date(item.muted_until).getTime() > now.getTime();
}

function ConversationListInner({ activeConversationId }: Props) {
  const t = useTranslations("direct-messaging");
  const tOrg = useTranslations("conversation-organization");
  const tFeature = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const timeZone = useTimeZone() ?? "UTC";
  const hydrated = useHydrated();
  const searchParams = useSearchParams();
  const queryHref = useQueryHref();
  const folderId = searchParams.get("folder");
  const { state } = useMessaging();
  const menus = useMemo(() => getContributions("listItemMenu"), []);

  if (state.conversations.length === 0) {
    if (folderId) {
      return (
        <div className={styles.listEmpty}>
          <p>{tOrg("folderEmptyHint")}</p>
        </div>
      );
    }
    return (
      <div className={styles.listEmpty}>
        <p>{t("emptyList")}</p>
        <Link href="/app/chats/new" className={`${ui.btn} ${ui.btnPrimary}`}>
          {t("startChat")}
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.chatList}>
      {state.conversations.map((item) => {
        const title = displayTitle(item);
        const unread = item.unread_count > 0;
        const muted = isMuted(item, now);
        const deleted = item.last_message_deletion_scope === "everyone";
        const menuCtx = {
          conversationId: item.id,
          conversationType: item.type,
          membership: {
            pinned_at: item.pinned_at,
            muted_until: item.muted_until,
            archived_at: item.archived_at,
          },
        };
        const availableMenus = menus.filter((menu) => menu.isAvailable(menuCtx));

        return (
          <li key={item.id} className={styles.chatItem}>
            <Link
              href={queryHref(`/app/chats/${item.id}`, { info: null, message: null })}
              className={styles.chatRow}
              aria-current={item.id === activeConversationId ? "true" : undefined}
            >
              <Avatar
                name={title}
                seed={item.other_user_id ?? item.id}
                src={item.other_avatar_url}
              />
              <span className={styles.chatRowBody}>
                <span className={styles.chatRowTop}>
                  <span className={styles.chatRowName}>{title}</span>
                  {item.last_message_at ? (
                    <time
                      className={styles.chatRowTime}
                      dateTime={item.last_message_at}
                      data-unread={unread ? "true" : "false"}
                    >
                      {hydrated ? listTime(item.last_message_at, now, timeZone, format, t) : null}
                    </time>
                  ) : null}
                </span>
                <span className={styles.chatRowBottom}>
                  <span
                    className={styles.chatRowPreview}
                    data-deleted={deleted ? "true" : "false"}
                  >
                    {deleted ? <Ban size={16} aria-hidden /> : null}
                    <span>{previewText(item, t)}</span>
                  </span>
                  <span className={styles.chatRowMeta}>
                    {item.pinned_at ? (
                      <Pin size={16} aria-label={t("pinned")} role="img" />
                    ) : null}
                    {muted ? (
                      <BellOff size={16} aria-label={t("muted")} role="img" />
                    ) : null}
                    {unread ? (
                      <span
                        className={`${ui.badge} ${muted ? ui.badgeMuted : ""}`}
                        aria-label={t("unreadCount", { count: item.unread_count })}
                      >
                        {item.unread_count}
                      </span>
                    ) : null}
                  </span>
                </span>
              </span>
            </Link>
            {availableMenus.length > 0 ? (
              <div className={styles.rowMenu}>
                {availableMenus.map((menu) => {
                  const Icon = menu.icon;
                  const label = tFeature(menu.labelKey!);
                  return (
                    <button
                      key={menu.id}
                      type="button"
                      className={`${ui.iconBtn} ${ui.iconBtnSm}`}
                      aria-label={`${label}: ${title}`}
                      title={label}
                      onClick={() => void menu.run(menuCtx)}
                    >
                      <Icon size={18} aria-hidden />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export const ConversationList = memo(ConversationListInner);
