"use client";

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useContext, useEffect, useRef } from "react";

import {
  getDesktopBridge,
  newMessageNotifications,
  totalUnread,
} from "@/platform/desktop-bridge";

import type { MessagingState } from "./types";

/**
 * Desktop Client only: raises native notifications for new messages, mirrors
 * the unread total to the taskbar/tray, and opens a chat when its
 * notification is clicked. A no-op in a normal browser (no bridge).
 */
export function useDesktopBridge(
  state: Pick<MessagingState, "conversations" | "archivedSummary" | "inboxStatus">,
  activeConversationId: string | undefined,
): void {
  // Read the context directly: null (not a throw) when no app router is mounted.
  const router = useContext(AppRouterContext);
  const prevRef = useRef<MessagingState["conversations"] | null>(null);
  const { conversations, archivedSummary, inboxStatus } = state;

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || !router) {
      return;
    }
    return bridge.onOpenChat((chatId) => {
      router.push(`/app/chats/${encodeURIComponent(chatId)}`);
    });
  }, [router]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || inboxStatus !== "ready") {
      return;
    }
    const prev = prevRef.current;
    prevRef.current = conversations;
    const windowActive = document.visibilityState === "visible" && document.hasFocus();
    for (const n of newMessageNotifications(prev, conversations, {
      activeConversationId,
      windowActive,
      now: Date.now(),
    })) {
      bridge.notify(n);
    }
    bridge.setUnreadCount(totalUnread(conversations, archivedSummary));
  }, [conversations, archivedSummary, inboxStatus, activeConversationId]);
}
