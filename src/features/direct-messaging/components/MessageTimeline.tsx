"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";

import { shouldGroupWithPrevious } from "../delivery";
import type { ConversationDetail } from "../types";
import type { PendingSend } from "../context/types";
import { useMessaging } from "../context/MessagingProvider";
import { MessageBubble } from "./MessageBubble";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
  conversationType: "direct" | "group";
  currentUserId: string;
  detail?: ConversationDetail;
};

function pendingAsMessage(pending: PendingSend): TimelineMessage {
  return {
    id: `pending-${pending.clientId}`,
    conversation_id: pending.conversationId,
    sender_id: "",
    client_id: pending.clientId,
    type: "text",
    body: pending.body,
    reply_to_id: pending.replyToId ?? null,
    created_at: pending.createdAt,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    status: pending.status,
  };
}

function MessageTimelineInner({
  conversationId,
  conversationType,
  currentUserId,
  detail,
}: Props) {
  const t = useTranslations("direct-messaging");
  const { state, retrySend, loadOlderMessages } = useMessaging();
  const stored = state.messagesByConversation[conversationId] ?? [];
  const pending = state.pendingSends.filter(
    (p) => p.conversationId === conversationId,
  );
  const separatorId =
    state.unreadSeparatorByConversation[conversationId] ?? null;

  const timeline = useMemo(() => {
    const pendingMessages = pending.map((entry) => ({
      ...pendingAsMessage(entry),
      sender_id: currentUserId,
    }));
    const merged = [...stored, ...pendingMessages].sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });
    return [...merged].reverse();
  }, [currentUserId, pending, stored]);

  if (timeline.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t("emptyThread")}</p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      {state.messagesHasMore[conversationId] ? (
        <button type="button" onClick={() => void loadOlderMessages(conversationId)}>
          {t("loadOlder")}
        </button>
      ) : null}
      {timeline.map((message, index) => {
        const previous = timeline[index - 1];
        const grouped = shouldGroupWithPrevious(message, previous);
        const pendingEntry = pending.find((p) => p.clientId === message.client_id);
        return (
          <div key={message.id}>
            {separatorId === message.id ? (
              <p className={styles.separator}>{t("newMessages")}</p>
            ) : null}
            <MessageBubble
              message={message}
              conversationId={conversationId}
              currentUserId={currentUserId}
              conversationType={conversationType}
              detail={detail}
              pendingStatus={pendingEntry?.status}
              grouped={grouped}
              onRetry={retrySend}
            />
          </div>
        );
      })}
    </div>
  );
}

export const MessageTimeline = memo(MessageTimelineInner);
