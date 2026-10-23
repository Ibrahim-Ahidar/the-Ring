"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import { MobileBackBar } from "@/shell/components/MobileBackBar";
import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { AddContactPrompt } from "@/features/discovery-contacts/components/AddContactPrompt";
import { useMessaging } from "../context/MessagingProvider";
import { useQueryHref } from "../hooks/useQueryHref";
import { conversationTitle } from "../lib/titles";
import type { ConversationDetail } from "../types";
import { MessageComposer } from "./MessageComposer";
import { MessageJumpTarget } from "./MessageJumpTarget";
import { MessageTimeline } from "./MessageTimeline";
import { PinnedBar } from "./PinnedBar";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
  detail: ConversationDetail;
  currentUserId: string;
};

function ThreadPanelInner({ conversationId, detail, currentUserId }: Props) {
  const t = useTranslations("direct-messaging");
  const tFeature = useTranslations();
  const { state } = useMessaging();
  const queryHref = useQueryHref();
  const headerStatuses = useMemo(() => getContributions("headerStatus"), []);
  const menus = useMemo(() => getContributions("listItemMenu"), []);
  const hasSearchTab = useMemo(
    () => getContributions("rightPanelTab").some((tab) => tab.id === "search-in-conversation"),
    [],
  );

  const title = conversationTitle(detail, t);
  const infoHref = queryHref(`/app/chats/${conversationId}`, { info: "1", message: null });
  const menuCtx = useMemo(
    () => ({
      conversationId,
      conversationType: detail.type,
      membership: {
        pinned_at: detail.pinned_at,
        muted_until: detail.muted_until,
        archived_at: detail.archived_at,
      },
    }),
    [conversationId, detail.archived_at, detail.muted_until, detail.pinned_at, detail.type],
  );
  const availableMenus = menus.filter((menu) => menu.isAvailable(menuCtx));

  return (
    <section className={styles.conversation} aria-label={t("conversationWith", { name: title })}>
      <header className={styles.convHeader}>
        <MobileBackBar
          href={queryHref("/app/chats", { info: null, message: null })}
          label={t("backToChats")}
        />
        <Link className={styles.convInfo} href={infoHref}>
          <Avatar
            name={title}
            seed={detail.other_user_id ?? conversationId}
            src={detail.other_avatar_url}
            size="md"
          />
          <div className={styles.convInfoText}>
            <h2 className={styles.convTitle}>{title}</h2>
            <div className={styles.convSubtitle}>
              {headerStatuses.map((entry) => (
                <entry.Component
                  key={entry.id}
                  conversationId={conversationId}
                  conversationType={detail.type}
                  otherUserId={detail.other_user_id ?? undefined}
                />
              ))}
            </div>
          </div>
        </Link>
        <div className={styles.convActions}>
          {hasSearchTab ? (
            <Link
              href={infoHref}
              className={ui.iconBtn}
              aria-label={t("searchInConversation")}
              title={t("searchInConversation")}
            >
              <Search size={24} aria-hidden />
            </Link>
          ) : null}
          {availableMenus.map((menu) => {
            const Icon = menu.icon;
            const label = tFeature(menu.labelKey!);
            return (
              <button
                key={menu.id}
                type="button"
                className={ui.iconBtn}
                aria-label={label}
                title={label}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void menu.run({ ...menuCtx, point: { x: rect.left, y: rect.bottom } });
                }}
              >
                <Icon size={24} aria-hidden />
              </button>
            );
          })}
        </div>
      </header>
      {detail.type === "direct" && detail.other_user_id && detail.other_username ? (
        <AddContactPrompt
          userId={detail.other_user_id}
          username={detail.other_username}
          displayName={detail.other_display_name}
        />
      ) : null}
      <PinnedBar conversationId={conversationId} />
      <MessageJumpTarget conversationId={conversationId} />
      <MessageTimeline
        conversationId={conversationId}
        conversationType={detail.type}
        currentUserId={currentUserId}
        detail={detail}
      />
      <MessageComposer conversationId={conversationId} />
    </section>
  );
}

export const ThreadPanel = memo(ThreadPanelInner);
