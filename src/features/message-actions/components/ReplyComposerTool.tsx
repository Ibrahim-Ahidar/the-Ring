"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMessaging } from "@/features/direct-messaging/context/MessagingProvider";

import {
  clearReplyTarget,
  getReplyTarget,
  type ReplyTarget,
} from "../message-actions-events";
import styles from "../message-actions.module.css";
import { JumpToReplyBridge } from "./JumpToReplyBridge";
import { MessagingMutationBridge } from "./MessagingMutationBridge";

type Props = {
  conversationId: string;
  disabled: boolean;
};

function ReplyComposerToolInner({ conversationId }: Props) {
  const t = useTranslations("message-actions");
  const { sendMessage } = useMessaging();
  const [target, setTarget] = useState<ReplyTarget | null>(() =>
    getReplyTarget(conversationId),
  );

  useEffect(() => {
    const sync = () => setTarget(getReplyTarget(conversationId));
    const interval = window.setInterval(sync, 200);
    return () => window.clearInterval(interval);
  }, [conversationId]);

  useEffect(() => {
    const textarea = document.getElementById(`composer-${conversationId}`);
    const form = textarea?.closest("form");
    if (!form || !(textarea instanceof HTMLTextAreaElement)) {
      return;
    }

    const onSubmit = (event: Event) => {
      const reply = getReplyTarget(conversationId);
      if (!reply) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const body = textarea.value.trim();
      if (!body) {
        return;
      }
      void sendMessage({
        conversationId,
        body,
        replyToId: reply.messageId,
      }).then(() => {
        clearReplyTarget(conversationId);
        setTarget(null);
      });
    };

    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [conversationId, sendMessage]);

  const dismiss = useCallback(() => {
    clearReplyTarget(conversationId);
    setTarget(null);
  }, [conversationId]);

  return (
    <>
      <JumpToReplyBridge />
      <MessagingMutationBridge />
      {!target || target.conversationId !== conversationId ? null : (
    <div className={styles.replyBanner} role="status">
      <div className={styles.replyBannerText}>
        <span className={styles.replyBannerLabel}>{t("reply.bannerLabel")}</span>
        <span className={styles.replyBannerPreview}>{target.preview}</span>
      </div>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t("reply.dismiss")}
        onClick={dismiss}
      >
        <X size={18} aria-hidden />
      </button>
    </div>
      )}
    </>
  );
}

export const ReplyComposerTool = memo(ReplyComposerToolInner);
