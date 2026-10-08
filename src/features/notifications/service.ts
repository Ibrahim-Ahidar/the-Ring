import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import { NOTIFICATION_PAGE_SIZE } from "./cursor";
import type {
  NotificationCursor,
  NotificationListPage,
  NotificationPreferences,
  NotificationRow,
} from "./types";

type DbNotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  actor_username: string | null;
  entity_id: string | null;
  conversation_id: string | null;
  read_at: string | null;
  created_at: string;
};

type DbPreferencesRow = {
  in_app_enabled: boolean;
  push_enabled: boolean;
  mentions_only: boolean;
};

function mapRow(row: DbNotificationRow): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    entityId: row.entity_id,
    conversationId: row.conversation_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function mapPreferences(row: DbPreferencesRow): NotificationPreferences {
  return {
    inAppEnabled: row.in_app_enabled,
    pushEnabled: row.push_enabled,
    mentionsOnly: row.mentions_only,
  };
}

export async function listNotifications(
  rpc: RpcClient,
  options: { cursor?: NotificationCursor | null } = {},
): Promise<Result<NotificationListPage>> {
  const result = await callRpc<DbNotificationRow[]>(rpc, "list_notifications", {
    p_cursor_created_at: options.cursor?.createdAt ?? null,
    p_cursor_id: options.cursor?.id ?? null,
  });

  if (!result.ok) {
    return result;
  }

  const rows = result.value ?? [];
  const items = rows.map(mapRow);
  const last = items.at(-1);
  const nextCursor =
    items.length >= NOTIFICATION_PAGE_SIZE && last
      ? { createdAt: last.createdAt, id: last.id }
      : null;

  return ok({ items, nextCursor });
}

function parseCount(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    return parseInt(value, 10);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("value" in obj) {
      return parseCount(obj.value);
    }
    const first = Object.values(obj)[0];
    if (first !== undefined) {
      return parseCount(first);
    }
  }
  return Number(value);
}

export async function unreadCount(rpc: RpcClient): Promise<Result<number>> {
  const result = await callRpc<unknown>(rpc, "get_notifications_unread_count");
  if (!result.ok) {
    return result;
  }
  return ok(parseCount(result.value));
}

export async function markRead(
  rpc: RpcClient,
  notificationId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function markAllRead(rpc: RpcClient): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "mark_all_notifications_read");
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function getPreferences(
  rpc: RpcClient,
): Promise<Result<NotificationPreferences>> {
  const result = await callRpc<DbPreferencesRow[]>(
    rpc,
    "get_notification_preferences",
  );
  if (!result.ok) {
    return result;
  }
  const row = result.value?.[0];
  if (!row) {
    return ok({
      inAppEnabled: true,
      pushEnabled: false,
      mentionsOnly: false,
    });
  }
  return ok(mapPreferences(row));
}

export async function updatePreferences(
  rpc: RpcClient,
  prefs: NotificationPreferences,
): Promise<Result<NotificationPreferences>> {
  const result = await callRpc<DbPreferencesRow[]>(
    rpc,
    "upsert_notification_preferences",
    {
      p_in_app_enabled: prefs.inAppEnabled,
      p_push_enabled: prefs.pushEnabled,
      p_mentions_only: prefs.mentionsOnly,
    },
  );
  if (!result.ok) {
    return result;
  }
  const row = result.value?.[0];
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapPreferences(row));
}
