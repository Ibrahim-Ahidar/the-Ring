"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { emitComposerActivity } from "@/platform/composer-events";
import { getContributions } from "@/shell/slots";

import { useMessaging } from "../context/MessagingProvider";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
};

function MessageComposerInner({ conversationId }: Props) {
  const t = useTranslations("direct-messaging");
  const { state, sendMessage, setDraft } = useMessaging();
  const draft = state.drafts[conversationId] ?? "";
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputSignal = useRef(0);
  const tools = useMemo(() => getContributions("composerTool"), []);
  const disabled = false;

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
    if (!body) {
      return;
    }
    await sendMessage({ conversationId, body });
    emitComposerActivity({ kind: "input", conversationId, isEmpty: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit(event as unknown as FormEvent);
    }
  };

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <div className={styles.toolsRow}>
        {tools.map((tool) => (
          <tool.Component
            key={tool.id}
            conversationId={conversationId}
            disabled={disabled}
          />
        ))}
      </div>
      <div className={styles.composerRow}>
        <label className="visually-hidden" htmlFor={`composer-${conversationId}`}>
          {t("composerLabel")}
        </label>
        <textarea
          id={`composer-${conversationId}`}
          className={styles.composerInput}
          value={draft}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("composerPlaceholder")}
        />
        <button type="submit" className="shell-nav-link" aria-label={t("send")}>
          <SendHorizontal size={20} aria-hidden />
        </button>
      </div>
    </form>
  );
}

export const MessageComposer = memo(MessageComposerInner);
