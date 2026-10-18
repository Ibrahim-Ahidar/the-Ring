"use client";

import Link from "next/link";
import { Ban, BellOff, Check, CheckCheck, Pin } from "lucide-react";
import { memo, useMemo, useState, type ReactNode } from "react";
import { useFormatter, useNow, useTimeZone, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Avatar } from "@/shell/components/Avatar";
import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { useChatsLoading } from "../context/LoadingContext";
import { useMessaging } from "../context/MessagingProvider";
import { useLongPress } from "../hooks/useLongPress";
import { useQueryHref } from "../hooks/useQueryHref";
import { calendarDaysAgo } from "../lib/calendar";
import { useHydrated } from "../lib/use-hydrated";
import type { ConversationSummary } from "../types";
import styles from "../direct-messaging.module.css";
import { LoadFailed } from "@/shell/components/LoadFailed";
import { ChatListSkeleton } from "./Skeletons";
import { ConversationActionsSheet } from "./ConversationActionsSheet";

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
  const archivedView = searchParams.get("archived") === "1";
  const filter = archivedView || folderId ? null : searchParams.get("filter");
  const groupsOnly = filter === "groups";
  const unreadOnly = filter === "unread";
  const tGroups = useTranslations("groups");
  const { state } = useMessaging();
  const { inbox: loading, inboxFailed } = useChatsLoading();
  const menus = useMemo(() => getContributions("listItemMenu"), []);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const bindPress = useLongPress<string>(setSheetId);

  if (state.conversations.length === 0) {
    if (loading) {
      return <ChatListSkeleton label={t("loadingChats")} />;
    }
    if (inboxFailed) {
      return <LoadFailed />;
    }
    if (archivedView) {
      return (
        <div className={styles.listEmpty}>
          <p>{t("archived.empty")}</p>
        </div>
      );
    }
    if (unreadOnly) {
      return (
        <div className={styles.listEmpty}>
          <p>{t("unreadEmpty")}</p>
        </div>
      );
    }
    if (groupsOnly) {
      return (
        <div className={styles.listEmpty}>
          <p>{tGroups("emptyGroups")}</p>
          <Link href="/app/groups/new" className={`${ui.btn} ${ui.btnPrimary}`}>
            {tGroups("createLink")}
          </Link>
        </div>
      );
    }
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

  const sheetItem = sheetId ? state.conversations.find((c) => c.id === sheetId) : undefined;
  let sheet: ReactNode = null;

  const list = (
    <ul className={styles.chatList}>
      {state.conversations.map((item) => {
        const title = displayTitle(item);
        const unread = item.unread_count > 0;
        const muted = isMuted(item, now);
        const deleted = item.last_message_deletion_scope === "everyone";
        const receipt = state.receiptsByConversation[item.id];
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
        if (item === sheetItem && availableMenus.length > 0) {
          sheet = (
            <ConversationActionsSheet
              title={title}
              menus={availableMenus}
              ctx={menuCtx}
              onClose={() => setSheetId(null)}
            />
          );
        }
        const press = availableMenus.length > 0 ? bindPress(item.id) : {};

        return (
          <li key={item.id} className={styles.chatItem}>
            <Link
              href={queryHref(`/app/chats/${item.id}`, { info: null, message: null })}
              prefetch={false}
              className={styles.chatRow}
              {...press}
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
                    {!deleted && receipt ? (
                      receipt === "sent" ? (
                        <Check size={16} aria-label={t("delivery.sent")} role="img" />
                      ) : (
                        <CheckCheck
                          size={16}
                          aria-label={t(`delivery.${receipt}`)}
                          role="img"
                          className={receipt === "read" ? styles.tickRead : undefined}
                        />
                      )
                    ) : null}
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
                <div className={styles.rowMenuInner}>
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
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {list}
      {sheet}
    </>
  );
}

export const ConversationList = memo(ConversationListInner);
