"use client";

import Link from "next/link";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { useMessaging } from "../context/MessagingProvider";
import type { ConversationDetail } from "../types";
import { ConversationList } from "./ConversationList";
import { ThreadPanel } from "./ThreadPanel";
import styles from "../direct-messaging.module.css";

type Props = {
  userId: string;
  activeConversationId?: string;
  threadDetail?: ConversationDetail;
};

function ChatsLayoutInner({
  userId,
  activeConversationId,
  threadDetail,
}: Props) {
  const t = useTranslations("direct-messaging");
  const { state } = useMessaging();
  const liveDetail =
    activeConversationId && threadDetail
      ? state.detailsByConversation[activeConversationId] ?? threadDetail
      : undefined;
  const showMobileThread = Boolean(activeConversationId && liveDetail);

  return (
    <div
      className={styles.layout}
      data-mobile-thread={showMobileThread ? "true" : "false"}
    >
      <section className={styles.listPane} aria-label={t("listLabel")}>
        <div className={styles.listHeader}>
          <h1 className={styles.threadTitle}>{t("title")}</h1>
          <Link href="/app/chats/new">{t("newChat")}</Link>
        </div>
        <ConversationList activeConversationId={activeConversationId} />
      </section>
      {activeConversationId && liveDetail ? (
        <ThreadPanel
          conversationId={activeConversationId}
          detail={liveDetail}
          currentUserId={userId}
        />
      ) : (
        <section className={styles.threadPane} aria-label={t("threadLabel")}>
          <div className={styles.empty}>
            <p>{t("selectConversation")}</p>
          </div>
        </section>
      )}
    </div>
  );
}

export const ChatsLayout = memo(ChatsLayoutInner);
