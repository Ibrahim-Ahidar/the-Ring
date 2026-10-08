"use client";

import { useSearchParams } from "next/navigation";
import { memo, Suspense, useEffect, useRef } from "react";

import { useMessaging } from "../context/MessagingProvider";
import styles from "../direct-messaging.module.css";

const MAX_PAGES = 10;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findMessageElement(messageId: string): HTMLElement | null {
  return document.querySelector(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  ) as HTMLElement | null;
}

function highlightMessage(node: HTMLElement): void {
  node.classList.add(styles.jumpHighlight);
  window.setTimeout(() => {
    node.classList.remove(styles.jumpHighlight);
  }, 1600);
}

function MessageJumpTargetInner({ conversationId }: { conversationId: string }) {
  const searchParams = useSearchParams();
  const { state, loadOlderMessages } = useMessaging();
  const attemptsRef = useRef(0);
  const runningRef = useRef(false);

  const messageId = searchParams.get("message");

  useEffect(() => {
    attemptsRef.current = 0;
    runningRef.current = false;
    if (!messageId) {
      return;
    }

    let cancelled = false;

    const tryJump = async () => {
      if (cancelled || runningRef.current) {
        return;
      }
      const node = findMessageElement(messageId);
      if (node) {
        node.scrollIntoView({
          block: "center",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        node.focus({ preventScroll: true });
        highlightMessage(node);
        return;
      }

      const hasMore = state.messagesHasMore[conversationId];
      const messages = state.messagesByConversation[conversationId] ?? [];
      const loaded = messages.some((item) => item.id === messageId);
      if (loaded) {
        return;
      }

      if (!hasMore || attemptsRef.current >= MAX_PAGES) {
        return;
      }

      runningRef.current = true;
      attemptsRef.current += 1;
      try {
        await loadOlderMessages(conversationId);
      } finally {
        runningRef.current = false;
      }
      if (!cancelled) {
        window.requestAnimationFrame(() => void tryJump());
      }
    };

    void tryJump();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    loadOlderMessages,
    messageId,
    state.messagesByConversation,
    state.messagesHasMore,
  ]);

  return null;
}

function MessageJumpTargetWithSuspense(props: { conversationId: string }) {
  return (
    <Suspense fallback={null}>
      <MessageJumpTargetInner {...props} />
    </Suspense>
  );
}

export const MessageJumpTarget = memo(MessageJumpTargetWithSuspense);
