import type {
  DeletionScope,
  MessageAttachment,
  MessageReaction,
  MessageType,
} from "@/platform/timeline";

export type RpcMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  type: MessageType;
  body: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deletion_scope: DeletionScope;
  pinned_at: string | null;
  forwarded: boolean;
  metadata: Record<string, unknown> | null;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  has_more?: boolean;
};

export type ConversationSummary = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  last_message_at: string | null;
  last_message_id: string | null;
  last_message_preview: string | null;
  last_message_deletion_scope: DeletionScope;
  unread_count: number;
  pinned_at: string | null;
  archived_at: string | null;
  muted_until: string | null;
  other_user_id: string | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  has_more?: boolean;
};

export type ConversationDetail = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  last_message_at: string | null;
  last_message_id: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
  pinned_at: string | null;
  archived_at: string | null;
  muted_until: string | null;
  other_user_id: string | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  other_last_read_message_id: string | null;
  other_last_read_created_at: string | null;
  other_send_read_receipts: boolean | null;
  role: "owner" | "admin" | "member";
};

/** Signed-in member shown in the chat list header. */
export type ChatsViewer = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type MarkReadResult = {
  last_read_message_id: string | null;
  last_read_at: string | null;
};

export type ListMessagesResult = {
  items: RpcMessageRow[];
  hasMore: boolean;
};

export type ListConversationsResult = {
  items: ConversationSummary[];
  hasMore: boolean;
};

export type ConversationCursor = {
  pinnedAt: string | null;
  lastMessageAt: string | null;
  id: string;
};

const CURSOR_SEP = "|";

export function encodeConversationCursor(cursor: ConversationCursor): string {
  const pin = cursor.pinnedAt ?? "null";
  const last = cursor.lastMessageAt ?? "null";
  const payload = `${pin}${CURSOR_SEP}${last}${CURSOR_SEP}${cursor.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}
