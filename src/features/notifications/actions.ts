"use server";

import { getSessionContext } from "@/platform/session";

import { decodeNotificationCursor } from "./cursor";
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  updatePreferences,
} from "./service";
import type { NotificationPreferences } from "./types";

export async function fetchNotificationsPageAction(cursorEncoded?: string | null) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }

  const cursor = cursorEncoded
    ? decodeNotificationCursor(cursorEncoded)
    : null;
  if (cursorEncoded && !cursor) {
    return { ok: false as const, error: { code: "platform.unexpected" } };
  }

  return listNotifications(session.rpc, { cursor });
}

export async function fetchUnreadCountAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return unreadCount(session.rpc);
}

export async function markNotificationReadAction(notificationId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return markRead(session.rpc, notificationId);
}

export async function markAllNotificationsReadAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return markAllRead(session.rpc);
}

export async function fetchNotificationPreferencesAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return getPreferences(session.rpc);
}

export async function updateNotificationPreferencesAction(
  prefs: NotificationPreferences,
) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return updatePreferences(session.rpc, prefs);
}
