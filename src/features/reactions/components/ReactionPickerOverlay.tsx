"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { emojiCatalogKey } from "../emoji-labels";
import {
  retainConversationReactions,
  useMessageReactions,
} from "../context/conversation-reactions-store";
import { aggregateEmojiCounts } from "../context/reactions-reducer";
import {
  onReactionPickerRequest,
  type ReactionPickerRequest,
} from "../reactions-events";
import styles from "../reactions.module.css";
import { ALLOWED_REACTION_EMOJI } from "../types";
import { useToggleReaction } from "../hooks/use-toggle-reaction";

function PickerPanel({
  request,
  onClose,
}: {
  request: ReactionPickerRequest;
  onClose: () => void;
}) {
  const t = useTranslations("reactions");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const { currentUserId } = request;

  useEffect(() => {
    return retainConversationReactions(
      request.conversationId,
      supabase,
      currentUserId,
      request.messageId,
      undefined,
    );
  }, [request.conversationId, request.messageId, currentUserId, supabase]);

  const reactions = useMessageReactions(request.conversationId, request.messageId);
  const counts = useMemo(
    () => aggregateEmojiCounts(reactions, currentUserId),
    [reactions, currentUserId],
  );
  const reacted = useMemo(
    () => new Set(counts.filter((c) => c.reactedByMe).map((c) => c.emoji)),
    [counts],
  );

  const toggle = useToggleReaction({
    conversationId: request.conversationId,
    messageId: request.messageId,
    userId: currentUserId,
  });

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const pick = useCallback(
    async (emoji: string) => {
      const mine = reacted.has(emoji);
      await toggle(emoji, mine);
      onClose();
    },
    [onClose, reacted, toggle],
  );

  return (
    <div
      className={styles.pickerBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={styles.pickerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reactions-picker-title"
      >
        <h3 id="reactions-picker-title">{t("pickerTitle")}</h3>
        <div className={styles.pickerGrid} role="toolbar" aria-label={t("pickerTitle")}>
          {ALLOWED_REACTION_EMOJI.map((emoji, index) => {
            const nameKey = emojiCatalogKey(emoji);
            const label = nameKey ? t(nameKey) : emoji;
            return (
              <button
                key={emoji}
                type="button"
                ref={index === 0 ? firstButtonRef : undefined}
                className={styles.pickerOption}
                aria-label={label}
                aria-pressed={reacted.has(emoji)}
                onClick={() => {
                  void pick(emoji);
                }}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="shell-nav-link"
          style={{ marginBlockStart: "var(--space-12)" }}
          onClick={onClose}
        >
          {t("pickerClose")}
        </button>
      </div>
    </div>
  );
}

function ReactionPickerOverlayInner() {
  const [request, setRequest] = useState<ReactionPickerRequest | null>(null);

  useEffect(() => {
    return onReactionPickerRequest((next) => {
      setRequest(next);
    });
  }, []);

  const close = useCallback(() => setRequest(null), []);

  if (!request) {
    return null;
  }

  return <PickerPanel request={request} onClose={close} />;
}

export const ReactionPickerOverlay = memo(ReactionPickerOverlayInner);
