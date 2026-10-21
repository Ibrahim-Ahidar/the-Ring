"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  emitComposerActivity,
  getComposerSendExtras,
  onComposerActivity,
} from "@/platform/composer-events";
import { composerAboveId } from "@/platform/composer-events";
import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { useDraft, useMessagingActions } from "../context/MessagingProvider";
import styles from "../direct-messaging.module.css";

export type ComposerDisabledReason = "blocked" | "removed" | "restricted";

type Props = {
  conversationId: string;
  /** Set when the user cannot post here; the composer shows the reason. */
  disabledReason?: ComposerDisabledReason;
};

/** Touch keyboards have no Shift+Enter, so Enter must insert a newline. */
function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function MessageComposerInner({ conversationId, disabledReason }: Props) {
  const t = useTranslations("direct-messaging");
  const { sendMessage, setDraft } = useMessagingActions();
  const draft = useDraft(conversationId);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputSignal = useRef(0);
  const tools = useMemo(() => getContributions("composerTool"), []);
  const sendAction = useMemo(() => getContributions("composerSendAction")[0], []);
  const [recording, setRecording] = useState(false);
  const disabled = disabledReason !== undefined;
  const canSend = !disabled && draft.trim().length > 0;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Fallback auto-grow for browsers without `field-sizing: content`; capped by CSS max-height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    setRecording(false);
    return onComposerActivity((activity) => {
      if (activity.kind === "recording" && activity.conversationId === conversationId) {
        setRecording(activity.active);
      }
    });
  }, [conversationId]);

  const signalInput = useCallback(
    (text: string) => {
      const isEmpty = text.trim().length === 0;
      const now = Date.now();
      if (now - lastInputSignal.current >= 3000) {
        emitComposerActivity({ kind: "input", conversationId, isEmpty });
        lastInputSignal.current = now;
      }
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      idleTimer.current = setTimeout(() => {
        emitComposerActivity({ kind: "input", conversationId, isEmpty: true });
      }, 3000);
    },
    [conversationId],
  );

  useEffect(() => {
    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
      emitComposerActivity({ kind: "closed", conversationId });
    };
  }, [conversationId]);

  const onChange = (value: string) => {
    setDraft(conversationId, value);
    signalInput(value);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || disabled) {
      return;
    }
    const extras = getComposerSendExtras(conversationId);
    await sendMessage({
      conversationId,
      body,
      replyToId: extras?.replyToId,
    });
    emitComposerActivity({ kind: "input", conversationId, isEmpty: true });
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    // Enter confirms an IME candidate (keyCode 229 on Android/older browsers); never send then.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (!isCoarsePointer()) {
      event.preventDefault();
      void onSubmit(event as unknown as FormEvent);
    }
  };

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <div id={composerAboveId(conversationId)} className={styles.composerAbove} />
      <div className={styles.composerBar}>
        <div className={styles.composerTools} hidden={recording}>
          {tools.map((tool) => (
            <tool.Component
              key={tool.id}
              conversationId={conversationId}
              disabled={disabled}
            />
          ))}
        </div>
        <label className="sr-only" htmlFor={`composer-${conversationId}`}>
          {t("composerLabel")}
        </label>
        <textarea
          id={`composer-${conversationId}`}
          className={styles.composerInput}
          hidden={recording}
          value={draft}
          ref={inputRef}
          rows={1}
          dir="auto"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? undefined : t("composerPlaceholder")}
          aria-describedby={disabled ? `composer-reason-${conversationId}` : undefined}
        />
        {sendAction && (!canSend || recording) ? (
          <sendAction.Component conversationId={conversationId} disabled={disabled} />
        ) : (
          <button
            type="submit"
            className={`${ui.iconBtn} ${ui.iconBtnAccent} ${styles.composerSend}`}
            aria-label={t("send")}
            title={t("send")}
            disabled={!canSend}
          >
            <SendHorizontal size={24} className="flip-rtl" aria-hidden />
          </button>
        )}
      </div>
      {disabledReason ? (
        <p id={`composer-reason-${conversationId}`} className={ui.notice} role="status">
          {t(`composerDisabled.${disabledReason}`)}
        </p>
      ) : null}
    </form>
  );
}

export const MessageComposer = memo(MessageComposerInner);
