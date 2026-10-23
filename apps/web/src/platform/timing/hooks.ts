/**
 * Call sites for the development-only timing tool (issue #215, spec section 11).
 *
 * This file is the ONLY importer of ./runtime. Every function takes its
 * timestamp synchronously, then loads the runtime behind a build-time constant
 * condition. In a production build `process.env.NODE_ENV` is inlined as
 * "production" and NEXT_PUBLIC_PULSE_TIMING is inlined as undefined, so the
 * condition folds to false and the dynamic import (and the whole runtime
 * chunk) is dropped. The condition is written out in each function on purpose:
 * bundlers fold literal comparisons reliably, not always across modules.
 */

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Composer submit: start of tap-to-bubble. */
export function timingTapStart(clientId: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    const t = nowMs();
    void import("./runtime").then((m) => m.tapStart(clientId, t));
  }
}

/** Call from an effect after the optimistic bubble committed. Waits one frame. */
export function timingBubbleShown(clientId: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    requestAnimationFrame(() => {
      const t = nowMs();
      void import("./runtime").then((m) => m.bubbleShown(clientId, t));
    });
  }
}

/** A message from someone else arrived over realtime. createdAt is the server row time. */
export function timingArrival(createdAt: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    const receivedAt = Date.now();
    void import("./runtime").then((m) => m.arrival(createdAt, receivedAt));
  }
}

/** Conversation row clicked: start of chat-open. */
export function timingChatOpenStart(conversationId: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    const t = nowMs();
    void import("./runtime").then((m) => m.chatOpenStart(conversationId, t));
  }
}

/** First message list paint for the conversation. Waits one frame. */
export function timingChatOpenPainted(conversationId: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    requestAnimationFrame(() => {
      const t = nowMs();
      void import("./runtime").then((m) => m.chatOpenPainted(conversationId, t));
    });
  }
}

/** Chat list first paint. Measured from performance.timeOrigin, once per page load. */
export function timingColdStartPainted(): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PULSE_TIMING === "1") {
    requestAnimationFrame(() => {
      const t = nowMs();
      void import("./runtime").then((m) => m.coldStartPainted(t));
    });
  }
}
