"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";

import { useMessaging } from "../context/MessagingProvider";
import type { ConversationDetail } from "../types";
import { MessageComposer } from "./MessageComposer";
import { MessageTimeline } from "./MessageTimeline";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
  detail: ConversationDetail;
  currentUserId: string;
};

function ThreadPanelInner({ conversationId, detail, currentUserId }: Props) {
  const t = useTranslations("direct-messaging");
  const { state } = useMessaging();
  const headerStatuses = useMemo(() => getContributions("headerStatus"), []);
  const rightTabs = useMemo(() => getContributions("rightPanelTab"), []);

  const title =
    detail.type === "group"
      ? detail.title ?? t("groupFallback")
      : detail.other_display_name ?? detail.other_username ?? t("directFallback");

  return (
    <section className={styles.threadPane} aria-label={t("threadLabel")}>
      <header className={styles.threadHeader}>
        <div className={styles.listTitleRow}>
          <h2 className={styles.threadTitle}>{title}</h2>
          <Link href="/app/chats/new">{t("newChat")}</Link>
        </div>
        <div className={styles.statusRow}>
          {state.connectionStatus === "reconnecting" ? (
            <span className={styles.reconnecting}>{t("reconnecting")}</span>
          ) : null}
          {headerStatuses.map((entry) => (
            <entry.Component
              key={entry.id}
              conversationId={conversationId}
              conversationType={detail.type}
              otherUserId={detail.other_user_id ?? undefined}
            />
          ))}
        </div>
        {rightTabs.length > 0 ? (
          <div className={styles.rightTabs}>
            {rightTabs.map((tab) => (
              <tab.Component key={tab.id} conversationId={conversationId} />
            ))}
          </div>
        ) : null}
      </header>
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
