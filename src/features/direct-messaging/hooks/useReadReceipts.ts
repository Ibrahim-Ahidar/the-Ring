"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type { TimelineMessage } from "@/platform/timeline";
import {
  useConversationView,
  useMarkSeenUpTo,
  useViewerId,
} from "../context/MessagingProvider";

const VISIBLE_THRESHOLD = 0.6;
const FLUSH_DELAY_MS = 300;

function isNewer(a: TimelineMessage, b: TimelineMessage | null): boolean {
  if (!b) {
    return true;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at;
  }
  return a.id > b.id;
}

function isActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Marks a conversation read from what is actually on screen.
 *
 * Returns a ref-callback factory: `ref={track(message)}` on each message row.
 * Incoming messages that are >= 60% inside `rootRef` while the tab is visible
 * and focused count as seen; the newest one is sent once per 300 ms flush and
 * never older than what was already sent.
 */
export function useReadTracker(
  conversationId: string,
  rootRef: RefObject<Element | null>,
): (message: TimelineMessage) => (el: Element | null) => void {
  const markSeenUpTo = useMarkSeenUpTo();
  const viewerId = useViewerId();
  const viewerIdRef = useRef(viewerId);
  viewerIdRef.current = viewerId;

  const state = useRef({
    observer: null as IntersectionObserver | null,
    messages: new Map<Element, TimelineMessage>(),
    visible: new Set<Element>(),
    candidate: null as TimelineMessage | null,
    lastSent: null as TimelineMessage | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    callbacks: new Map<string, (el: Element | null) => void>(),
    elements: new Map<string, Element>(),
  });

  const flush = useCallback(() => {
    const s = state.current;
    s.timer = null;
    const candidate = s.candidate;
    s.candidate = null;
    if (!candidate || !isActive()) {
      return;
    }
    if (s.lastSent && !isNewer(candidate, s.lastSent)) {
      return;
    }
    s.lastSent = candidate;
    void markSeenUpTo(conversationId, candidate);
  }, [conversationId, markSeenUpTo]);

  const consider = useCallback(
    (message: TimelineMessage) => {
      const s = state.current;
      if (
        message.deleted_at ||
        !viewerIdRef.current ||
        message.sender_id === viewerIdRef.current ||
        !isActive()
      ) {
        return;
      }
      if (isNewer(message, s.candidate)) {
        s.candidate = message;
      }
      if (s.timer === null) {
        s.timer = setTimeout(flush, FLUSH_DELAY_MS);
      }
    },
    [flush],
  );

  const getObserver = useCallback(() => {
    const s = state.current;
    if (s.observer || typeof IntersectionObserver === "undefined") {
      return s.observer;
    }
    s.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            s.visible.add(entry.target);
            const message = s.messages.get(entry.target);
            if (message) {
              consider(message);
            }
          } else {
            s.visible.delete(entry.target);
          }
        }
      },
      { root: rootRef.current, threshold: VISIBLE_THRESHOLD },
    );
    return s.observer;
  }, [consider, rootRef]);

  // Re-check whatever is on screen once the viewer is known.
  useEffect(() => {
    if (!viewerId) {
      return;
    }
    const s = state.current;
    for (const el of s.visible) {
      const message = s.messages.get(el);
      if (message) {
        consider(message);
      }
    }
  }, [viewerId, consider]);

  // Re-check whatever is on screen when the tab becomes active again.
  useEffect(() => {
    const recheck = () => {
      if (!isActive()) {
        return;
      }
      for (const el of state.current.visible) {
        const message = state.current.messages.get(el);
        if (message) {
          consider(message);
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        recheck();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisibility);
    const s = state.current;
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.timer !== null) {
        clearTimeout(s.timer);
        s.timer = null;
      }
      s.observer?.disconnect();
      s.observer = null;
      s.visible.clear();
      s.messages.clear();
      s.callbacks.clear();
      s.elements.clear();
    };
  }, [consider, conversationId]);

  return useMemo(
    () => (message: TimelineMessage) => {
      const s = state.current;
      const cached = s.callbacks.get(message.id);
      if (cached) {
        return cached;
      }
      const callback = (el: Element | null) => {
        const previous = s.elements.get(message.id);
        if (previous && previous !== el) {
          s.observer?.unobserve(previous);
          s.messages.delete(previous);
          s.visible.delete(previous);
          s.elements.delete(message.id);
        }
        if (el && previous !== el) {
          s.elements.set(message.id, el);
          s.messages.set(el, message);
          getObserver()?.observe(el);
        }
      };
      s.callbacks.set(message.id, callback);
      return callback;
    },
    [getObserver],
  );
}
