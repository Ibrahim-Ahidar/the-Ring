import type { ConversationSummary, RpcMessageRow } from "../messaging-types";
import type { ConversationRow, MessageRow } from "./types";

/**
 * Server shapes <-> spec 6.2 rows. Columns that 6.2 does not name travel inside
 * `messages.media_json` (messages) and `kv` key `conversation_extra:<id>` (conversations),
 * so the schema stays identical on every Client and the mapping is lossless.
 */
export const CONVERSATION_EXTRA_PREFIX = "conversation_extra:";

type MessageExtra = Pick<
  RpcMessageRow,
  | "client_id"
  | "deleted_at"
  | "deletion_scope"
  | "pinned_at"
  | "forwarded"
  | "metadata"
  | "attachments"
  | "reactions"
>;

export function rpcMessageToRow(row: RpcMessageRow, receivedAt: string): MessageRow {
  const extra: MessageExtra = {
    client_id: row.client_id,
    deleted_at: row.deleted_at,
    deletion_scope: row.deletion_scope,
    pinned_at: row.pinned_at,
    forwarded: row.forwarded,
    metadata: row.metadata,
    ...(row.attachments ? { attachments: row.attachments } : {}),
    ...(row.reactions ? { reactions: row.reactions } : {}),
  };
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_user_id: row.sender_id,
    sender_device_id: null,
    sent_at: row.created_at,
    received_at: receivedAt,
    kind: row.type,
    body: row.body,
    reply_to_id: row.reply_to_id,
    edited_at: row.edited_at,
    deleted: row.deleted_at ? 1 : 0,
    status: null,
    media_json: JSON.stringify(extra),
  };
}

export function rowToRpcMessage(row: MessageRow): RpcMessageRow {
  let extra: Partial<MessageExtra> = {};
  if (row.media_json) {
    try {
      extra = JSON.parse(row.media_json) as Partial<MessageExtra>;
    } catch {
      extra = {};
    }
  }
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_user_id ?? "",
    client_id: extra.client_id ?? row.id,
    type: row.kind as RpcMessageRow["type"],
    body: row.body,
    reply_to_id: row.reply_to_id,
    created_at: row.sent_at,
    edited_at: row.edited_at,
    deleted_at: extra.deleted_at ?? null,
    deletion_scope: extra.deletion_scope ?? "none",
    pinned_at: extra.pinned_at ?? null,
    forwarded: extra.forwarded ?? false,
    metadata: extra.metadata ?? null,
    ...(extra.attachments ? { attachments: extra.attachments } : {}),
    ...(extra.reactions ? { reactions: extra.reactions } : {}),
  };
}

export function summaryToRow(s: ConversationSummary): {
  row: ConversationRow;
  extraKey: string;
  extra: string;
} {
  const { has_more: _hasMore, ...rest } = s;
  return {
    row: {
      id: s.id,
      kind: s.type,
      title: s.title,
      avatar: s.other_avatar_url,
      last_message_id: s.last_message_id,
      unread_count: s.unread_count,
      updated_at: s.last_message_at,
    },
    extraKey: CONVERSATION_EXTRA_PREFIX + s.id,
    extra: JSON.stringify(rest),
  };
}

/** Rebuilds a summary from the row; `extra` (kv value) restores the fields 6.2 does not name. */
export function rowToSummary(row: ConversationRow, extra: string | null): ConversationSummary {
  let parsed: Partial<ConversationSummary> = {};
  if (extra) {
    try {
      parsed = JSON.parse(extra) as Partial<ConversationSummary>;
    } catch {
      parsed = {};
    }
  }
  return {
    last_message_deletion_scope: "none",
    last_message_preview: null,
    pinned_at: null,
    archived_at: null,
    muted_until: null,
    other_user_id: null,
    other_username: null,
    other_display_name: null,
    other_avatar_url: row.avatar,
    ...parsed,
    id: row.id,
    type: row.kind as ConversationSummary["type"],
    title: row.title,
    last_message_id: row.last_message_id,
    last_message_at: row.updated_at,
    unread_count: row.unread_count,
  };
}
