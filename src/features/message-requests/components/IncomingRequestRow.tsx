"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { useMessageRequests } from "../context/MessageRequestsProvider";
import { messageRequestErrorMessage } from "../error-message";
import type { IncomingMessageRequest } from "../types";
import styles from "../message-requests.module.css";
import { DeclineConfirmDialog } from "./DeclineConfirmDialog";

type Props = {
  item: IncomingMessageRequest;
};

function displayName(item: IncomingMessageRequest): string {
  return item.displayName?.trim() || item.username;
}

function IncomingRequestRowInner({ item }: Props) {
  const t = useTranslations("message-requests");
  const format = useFormatter();
  const router = useRouter();
  const { state, accept, decline } = useMessageRequests();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = state.actingRequestId === item.id;
  const name = displayName(item);

  const onAccept = async () => {
    setError(null);
    const result = await accept(item.id);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    router.push(`/app/chats/${result.conversationId}`);
  };

  const onDeclineConfirm = async () => {
    setError(null);
    const result = await decline(item.id);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setDeclineOpen(false);
  };

  return (
    <li className={styles.row}>
      <Avatar name={name} seed={item.username} size="md" />
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <span className={`${styles.rowName} bidi-auto`}>{name}</span>
          <time className={styles.rowTime} dateTime={item.createdAt}>
            {format.dateTime(new Date(item.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </div>
        <span className={`${styles.rowHandle} handle`}>@{item.username}</span>
        {item.note ? <p className={`${styles.note} bidi-auto`}>{item.note}</p> : null}
        {item.status === "pending" ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSm} ${ui.btnSecondary}`}
              onClick={() => setDeclineOpen(true)}
              disabled={busy}
            >
              <X size={16} aria-hidden />
              {t("decline")}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSm} ${ui.btnPrimary}`}
              onClick={() => void onAccept()}
              disabled={busy}
            >
              <Check size={16} aria-hidden />
              {t("accept")}
            </button>
          </div>
        ) : (
          <span className={`${ui.tag} ${ui.tagNeutral}`}>{t(`status.${item.status}`)}</span>
        )}
        {item.status === "accepted" && item.conversationId ? (
          <Link
            href={`/app/chats/${item.conversationId}`}
            className={`${ui.btn} ${ui.btnSm} ${ui.btnSecondary}`}
          >
            {t("openChat")}
          </Link>
        ) : null}
        {error ? (
          <p className={ui.errorText} role="alert">
            {messageRequestErrorMessage(t, error)}
          </p>
        ) : null}
      </div>
      <DeclineConfirmDialog
        open={declineOpen}
        displayName={name}
        onConfirm={() => void onDeclineConfirm()}
        onCancel={() => setDeclineOpen(false)}
        busy={busy}
      />
    </li>
  );
}

export const IncomingRequestRow = memo(IncomingRequestRowInner);
