"use client";

import { Check, CheckCheck, CircleAlert, Clock, Forward } from "lucide-react";
import { memo, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";

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
  quoteSelf?: boolean;
  quoteAuthor?: string | null;
  quoteText?: string;
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

function DeliveryIcon({ status, label }: { status: OutboundDelivery; label: string }) {
  const common = { size: 16, role: "img" as const, "aria-label": label };
  switch (status) {
    case "pending":
      return <Clock {...common} size={14} />;
    case "failed":
      return <CircleAlert {...common} className={styles.tickFailed} />;
    case "read":
      return <CheckCheck {...common} className={styles.tickRead} />;
    default:
      return <Check {...common} />;
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
  quoteSelf,
  quoteAuthor,
  quoteText,
  onRetry,
}: Props) {
  const t = useTranslations("direct-messaging");
  const format = useFormatter();
  const extras = useMemo(() => getContributions("bubbleExtra"), []);

  if (message.type === "system") {
    return (
      <div className={styles.systemNote} tabIndex={-1} data-message-id={message.id}>
        <MessageRendererHost message={message} currentUserId={currentUserId} />
      </div>
    );
  }

  const isMine = message.sender_id === currentUserId;
  const delivery = isMine
    ? outboundDeliveryStatus(message, detail, pendingStatus)
    : null;
  const deleted = message.deletion_scope === "everyone";
  const time = format.dateTime(new Date(message.created_at), {
    hour: "numeric",
    minute: "numeric",
  });

  return (
    <div
      className={styles.msg}
      data-mine={isMine ? "true" : "false"}
      data-first={grouped ? "false" : "true"}
    >
      <article
        className={styles.bubble}
        tabIndex={-1}
        data-message-id={
          message.id.startsWith("pending-") ? message.client_id : message.id
        }
      >
        {message.forwarded && !deleted ? (
          <span className={styles.forwarded}>
            <Forward size={14} aria-hidden />
            {t("forwarded")}
          </span>
        ) : null}
        {quoteText && !deleted ? (
          <span className={styles.quote} data-self={quoteSelf ? "true" : "false"}>
            {quoteAuthor ? <span className={styles.quoteAuthor}>{quoteAuthor}</span> : null}
            <span className={styles.quoteText}>{quoteText}</span>
          </span>
        ) : null}
        <MessageRendererHost message={message} currentUserId={currentUserId} />
        <span className={styles.bubbleMeta}>
          {message.edited_at && !deleted ? <span>{t("edited")} ·</span> : null}
          <time dateTime={message.created_at}>{time}</time>
          {delivery ? (
            <DeliveryIcon status={delivery} label={deliveryLabel(t, delivery)} />
          ) : null}
        </span>
        {extras.map((extra) => (
          <extra.Component
            key={extra.id}
            message={message}
            currentUserId={currentUserId}
          />
        ))}
        <MessageActionHost
          message={message}
          conversationId={conversationId}
          currentUserId={currentUserId}
          conversationType={conversationType}
          role={detail?.role}
        />
      </article>
      {pendingStatus === "failed" && onRetry ? (
        <button
          type="button"
          className={styles.retry}
          onClick={() => onRetry(message.client_id)}
        >
          {t("retrySend")}
        </button>
      ) : null}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
