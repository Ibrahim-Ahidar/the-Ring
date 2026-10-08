"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { memo, Suspense, useEffect, useRef } from "react";

const MAX_LOAD_ATTEMPTS = 10;
const POLL_MS = 200;

function findMessageElement(messageId: string): HTMLElement | null {
  return document.querySelector(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  ) as HTMLElement | null;
}

function clickLoadOlder(): boolean {
  const timeline = document.querySelector('[class*="timeline"]');
  if (!timeline) {
    return false;
  }
  const button = timeline.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    return false;
  }
  button.click();
  return true;
}

function MessageJumpListenerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    attemptsRef.current = 0;

    if (!pathname.startsWith("/app/chats/")) {
      return;
    }

    const messageId = searchParams.get("message");
    if (!messageId) {
      return;
    }

    const tryJump = () => {
      const node = findMessageElement(messageId);
      if (node) {
        node.scrollIntoView({ block: "center", behavior: "auto" });
        node.focus({ preventScroll: true });
        return;
      }

      if (attemptsRef.current >= MAX_LOAD_ATTEMPTS) {
        return;
      }

      const clicked = clickLoadOlder();
      attemptsRef.current += 1;
      if (!clicked && attemptsRef.current >= MAX_LOAD_ATTEMPTS) {
        return;
      }

      timerRef.current = setTimeout(tryJump, POLL_MS);
    };

    timerRef.current = setTimeout(tryJump, POLL_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [pathname, searchParams]);

  return null;
}

function MessageJumpListenerWithSuspense() {
  return (
    <Suspense fallback={null}>
      <MessageJumpListenerInner />
    </Suspense>
  );
}

export const MessageJumpListener = memo(MessageJumpListenerWithSuspense);
