"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import { getContributions } from "@/shell/slots";

import { outboundDeliveryStatus, type OutboundDelivery } from "../delivery";
import type { ConversationDetail } from "../types";
import { MessageActionHost } from "./MessageActionHost";
import { MessageRendererHost } from "./MessageRendererHost";
import styles from "../direct-messaging.module.css";

type Props = {
  message: TimelineMessage;
  conversationId: string;
  currentUserId: string;
  conversationType: "direct" | "group";
  detail?: ConversationDetail;
  pendingStatus?: "pending" | "failed";
  grouped: boolean;
  onRetry?: (clientId: string) => void;
};

function deliveryLabel(
  t: ReturnType<typeof useTranslations>,
  status: OutboundDelivery,
): string {
  switch (status) {
    case "pending":
      return t("delivery.pending");
    case "failed":
      return t("delivery.failed");
    case "read":
      return t("delivery.read");
    default:
      return t("delivery.sent");
  }
}

function MessageBubbleInner({
  message,
  conversationId,
  currentUserId,
  conversationType,
  detail,
  pendingStatus,
  grouped,
  onRetry,
}: Props) {
  const t = useTranslations("direct-messaging");
  const extras = useMemo(() => getContributions("bubbleExtra"), []);
  const isMine = message.sender_id === currentUserId;
  const delivery = isMine
    ? outboundDeliveryStatus(message, detail, pendingStatus)
    : null;

  return (
    <div
      className={styles.messageRow}
      data-mine={isMine ? "true" : "false"}
      data-grouped={grouped ? "true" : "false"}
    >
      <article
        className={styles.bubble}
        data-message-id={
          message.id.startsWith("pending-") ? message.client_id : message.id
        }
      >
        {message.reply_to_id ? (
          <p className={styles.listPreview}>{t("replyQuote")}</p>
        ) : null}
        <MessageRendererHost message={message} currentUserId={currentUserId} />
        {message.edited_at ? (
          <p className={styles.bubbleMeta}>{t("edited")}</p>
        ) : null}
        {extras.map((extra) => (
          <extra.Component
            key={extra.id}
            message={message}
            currentUserId={currentUserId}
          />
        ))}
      </article>
      <div className={styles.bubbleMeta}>
        {delivery ? <span>{deliveryLabel(t, delivery)}</span> : null}
        {pendingStatus === "failed" && onRetry ? (
          <button type="button" onClick={() => onRetry(message.client_id)}>
            {t("retrySend")}
          </button>
        ) : null}
        <MessageActionHost
          message={message}
          conversationId={conversationId}
          currentUserId={currentUserId}
          conversationType={conversationType}
        />
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
