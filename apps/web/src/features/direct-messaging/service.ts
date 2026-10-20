import {
  decodeMessageCursor,
  encodeMessageCursor,
  type MessageCursor,
} from "@pulse/core/pagination";
import { callRpc, type RpcClient } from "@pulse/core/rpc";
import { err, ok, type Result } from "@pulse/core/result";
import type { TimelineMessage } from "@pulse/core/timeline";

import {
  encodeConversationCursor,
  type ArchivedSummary,
  type ConversationDetail,
  type ConversationReceipt,
  type ConversationReceiptStatus,
  type ConversationSummary,
  type ListConversationsResult,
  type ListMessagesResult,
  type MarkReadResult,
  type RpcMessageRow,
} from "./types";

export function mapMessageRow(row: RpcMessageRow): TimelineMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    client_id: row.client_id,
    type: row.type,
    body: row.body,
    reply_to_id: row.reply_to_id,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    deletion_scope: row.deletion_scope,
    pinned_at: row.pinned_at,
    forwarded: row.forwarded,
    metadata: row.metadata,
    ...(row.attachments ? { attachments: row.attachments } : {}),
    ...(row.reactions ? { reactions: row.reactions } : {}),
  };
}

export async function openDirect(
  rpc: RpcClient,
  input: { username: string },
): Promise<Result<{ conversationId: string }>> {
  const result = await callRpc<string>(rpc, "open_direct", {
    p_username: input.username,
  });
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    return err("platform.unexpected");
  }
  return ok({ conversationId: result.value });
}

export async function sendText(
  rpc: RpcClient,
  input: {
    conversationId: string;
    clientId: string;
    body: string;
    replyToId?: string | null;
  },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "send_text", {
    p_conversation_id: input.conversationId,
    p_client_id: input.clientId,
    p_body: input.body,
    p_reply_to_id: input.replyToId ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}

export async function listMessages(
  rpc: RpcClient,
  input: { conversationId: string; cursor?: string | null; limit?: number },
): Promise<Result<ListMessagesResult>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "list_messages", {
    p_conversation_id: input.conversationId,
    p_cursor: input.cursor ?? null,
    p_limit: input.limit ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  const hasMore = rows.length > 0 ? Boolean(rows[0]?.has_more) : false;
  return ok({ items: rows, hasMore });
}

export async function listConversations(
  rpc: RpcClient,
  input: {
    cursor?: string | null;
    archivedOnly?: boolean;
    unreadOnly?: boolean;
    folderId?: string | null;
    type?: "direct" | "group" | null;
  },
): Promise<Result<ListConversationsResult>> {
  const result = await callRpc<ConversationSummary[]>(rpc, "list_conversations", {
    p_cursor: input.cursor ?? null,
    p_archived_only: input.archivedOnly ?? false,
    p_folder_id: input.folderId ?? null,
    p_type: input.type ?? null,
    p_unread_only: input.unreadOnly ?? false,
  });
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  const hasMore = rows.length > 0 ? Boolean(rows[0]?.has_more) : false;
  return ok({ items: rows, hasMore });
}

export async function getArchivedSummary(
  rpc: RpcClient,
): Promise<Result<ArchivedSummary>> {
  const result = await callRpc<{ chat_count: number; unread: number }[]>(
    rpc,
    "archived_summary",
    {},
  );
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  return ok({ count: row?.chat_count ?? 0, unread: row?.unread ?? 0 });
}

export async function markRead(
  rpc: RpcClient,
  input: { conversationId: string; messageId: string },
): Promise<Result<MarkReadResult>> {
  const result = await callRpc<MarkReadResult[]>(rpc, "mark_read", {
    p_conversation_id: input.conversationId,
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row);
}

export async function markDelivered(
  rpc: RpcClient,
  input: { conversationId?: string | null },
): Promise<Result<null>> {
  const result = await callRpc<null>(rpc, "mark_delivered", {
    p_conversation_id: input.conversationId ?? null,
  });
  return result.ok ? ok(null) : result;
}

export async function getConversationReceipts(
  rpc: RpcClient,
  input: { conversationIds: string[] },
): Promise<Result<Record<string, ConversationReceipt>>> {
  if (input.conversationIds.length === 0) {
    return ok({});
  }
  const result = await callRpc<
    {
      conversation_id: string;
      status: ConversationReceiptStatus;
      message_id: string;
    }[]
  >(
    rpc,
    "conversation_receipts",
    { p_conversation_ids: input.conversationIds },
  );
  if (!result.ok) {
    return result;
  }
  const map: Record<string, ConversationReceipt> = {};
  for (const row of result.value ?? []) {
    map[row.conversation_id] = { status: row.status, messageId: row.message_id };
  }
  return ok(map);
}

export async function getConversation(
  rpc: RpcClient,
  input: { conversationId: string },
): Promise<Result<ConversationDetail>> {
  const result = await callRpc<ConversationDetail[]>(rpc, "get_conversation", {
    p_conversation_id: input.conversationId,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row);
}

export function messagePageNextCursor(
  items: RpcMessageRow[],
): string | null {
  if (items.length === 0) {
    return null;
  }
  const last = items[items.length - 1]!;
  const cursor: MessageCursor = {
    createdAt: last.created_at,
    id: last.id,
  };
  return encodeMessageCursor(cursor);
}

export function conversationPageNextCursor(
  items: ConversationSummary[],
): string | null {
  if (items.length === 0) {
    return null;
  }
  const last = items[items.length - 1]!;
  return encodeConversationCursor({
    pinnedAt: last.pinned_at,
    lastMessageAt: last.last_message_at,
    id: last.id,
  });
}

export function decodeMessagePageCursor(encoded: string): MessageCursor | null {
  return decodeMessageCursor(encoded);
}
