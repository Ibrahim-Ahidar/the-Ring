/**
 * Adapter for the Desktop Client's `window.pulseDesktop` preload bridge.
 * Absent in normal browsers: every caller must treat `null` as "do nothing".
 */

import type { ArchivedSummary, ConversationSummary } from "@/features/direct-messaging/types";

export type DesktopBridge = {
  version: string;
  notify(payload: { chatId: string; title: string; body: string }): void;
  setUnreadCount(count: number): void;
  onOpenChat(cb: (chatId: string) => void): () => void;
};

declare global {
  interface Window {
    pulseDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(
  win: { pulseDesktop?: DesktopBridge } | undefined = typeof window === "undefined"
    ? undefined
    : window,
): DesktopBridge | null {
  const bridge = win?.pulseDesktop;
  if (!bridge || typeof bridge.notify !== "function") {
    return null;
  }
  return bridge;
}

export type NotifyContext = {
  /** The chat currently open, if any. */
  activeConversationId: string | undefined;
  /** The page is visible and the window has focus. */
  windowActive: boolean;
  now: number;
};

export type DesktopNotification = { chatId: string; title: string; body: string };

function isMuted(c: ConversationSummary, now: number): boolean {
  return c.muted_until !== null && Date.parse(c.muted_until) > now;
}

/**
 * Notifications for chats that gained an unread message between two inbox
 * snapshots. The first snapshot (prev null) never notifies.
 */
export function newMessageNotifications(
  prev: readonly ConversationSummary[] | null,
  next: readonly ConversationSummary[],
  ctx: NotifyContext,
): DesktopNotification[] {
  if (prev === null) {
    return [];
  }
  const before = new Map(prev.map((c) => [c.id, c]));
  const out: DesktopNotification[] = [];
  for (const c of next) {
    const old = before.get(c.id);
    const arrived =
      c.last_message_id !== null &&
      c.last_message_id !== old?.last_message_id &&
      c.unread_count > (old?.unread_count ?? 0);
    if (!arrived || isMuted(c, ctx.now) || c.archived_at !== null) {
      continue;
    }
    if (ctx.windowActive && ctx.activeConversationId === c.id) {
      continue;
    }
    const title = c.title ?? c.other_display_name ?? c.other_username ?? "Pulse";
    out.push({ chatId: c.id, title, body: c.last_message_preview ?? "" });
  }
  return out;
}

export function totalUnread(
  conversations: readonly ConversationSummary[],
  archived: ArchivedSummary,
): number {
  return conversations.reduce((sum, c) => sum + c.unread_count, 0) + archived.unread;
}
