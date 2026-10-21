/**
 * Shared timeline message shape (messages table row plus client-side fields).
 */
export type MessageType = "text" | "image" | "file" | "audio" | "system";

export type MessageDeliveryStatus = "pending" | "failed" | "sent";

export type DeletionScope = "none" | "everyone";

export type MessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  file_name: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  waveform: unknown;
  created_at: string;
};

export type TimelineMessage = {
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
  status?: MessageDeliveryStatus;
};
