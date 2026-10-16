"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMessagingActions } from "@/features/direct-messaging/context/MessagingProvider";
import { composerAboveId } from "@/platform/composer-events";
import ui from "@/shell/styles/ui.module.css";

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
  const { sendMessage } = useMessagingActions();
  const [target, setTarget] = useState<ReplyTarget | null>(() =>
    getReplyTarget(conversationId),
  );
  const [bannerHost, setBannerHost] = useState<HTMLElement | null>(null);

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

  useEffect(() => {
    setBannerHost(document.getElementById(composerAboveId(conversationId)));
  }, [conversationId]);

  const dismiss = useCallback(() => {
    clearReplyTarget(conversationId);
    setTarget(null);
  }, [conversationId]);

  const banner =
    !target || target.conversationId !== conversationId ? null : (
      <div className={styles.replyBanner} role="status">
        <div className={styles.replyQuote}>
          <span className={styles.replyLabel}>{t("reply.bannerLabel")}</span>
          <span className={styles.replyPreview}>{target.preview}</span>
        </div>
        <button
          type="button"
          className={`${ui.iconBtn} ${ui.iconBtnSm}`}
          aria-label={t("reply.dismiss")}
          title={t("reply.dismiss")}
          onClick={dismiss}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    );

  return (
    <>
      <JumpToReplyBridge />
      <MessagingMutationBridge />
      {banner && bannerHost ? createPortal(banner, bannerHost) : banner}
    </>
  );
}

export const ReplyComposerTool = memo(ReplyComposerToolInner);
