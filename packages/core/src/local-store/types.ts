export type SqlValue = string | number | null | Uint8Array;

/** The only thing an adapter implements. */
export interface SqlExecutor {
  exec(sql: string, params?: readonly SqlValue[]): Promise<void>;
  query<T = Record<string, SqlValue>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T[]>;
  /** Runs fn inside BEGIN/COMMIT; rolls back when fn throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export type ConversationRow = {
  id: string;
  kind: string;
  title: string | null;
  avatar: string | null;
  last_message_id: string | null;
  unread_count: number;
  updated_at: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_device_id: string | null;
  sent_at: string;
  received_at: string | null;
  kind: string;
  body: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted: number;
  status: string | null;
  media_json: string | null;
};

export type ReactionRow = { message_id: string; user_id: string; emoji: string };

export type ReceiptRow = {
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
};

export type OutboxRow = {
  id: string;
  payload: string;
  attempts: number;
  next_attempt_at: string | null;
};

export type MessagePageCursor = { sentAt: string; id: string };
