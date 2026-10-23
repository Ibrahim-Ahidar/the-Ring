import { LOCAL_SCHEMA_STATEMENTS, LOCAL_SCHEMA_VERSION } from "./schema";
import type {
  ConversationRow,
  MessagePageCursor,
  MessageRow,
  OutboxRow,
  ReactionRow,
  ReceiptRow,
  SqlExecutor,
  SqlValue,
} from "./types";

export type LocalStoreChange = {
  table: "conversations" | "messages" | "reactions" | "receipts" | "outbox" | "kv" | "all";
  conversationId?: string;
};

export interface LocalStore {
  /** Creates the schema when missing. Safe to call more than once. */
  init(): Promise<void>;

  upsertConversations(rows: readonly ConversationRow[]): Promise<void>;
  getConversation(id: string): Promise<ConversationRow | null>;
  /** Newest activity first. */
  listConversations(): Promise<ConversationRow[]>;

  upsertMessages(rows: readonly MessageRow[]): Promise<void>;
  getMessage(id: string): Promise<MessageRow | null>;
  /** Newest first, paged by (sent_at, id): pass the last row's cursor as `before`. */
  listMessages(
    conversationId: string,
    opts?: { limit?: number; before?: MessagePageCursor | null },
  ): Promise<MessageRow[]>;
  countMessages(conversationId: string): Promise<number>;

  setReaction(row: ReactionRow): Promise<void>;
  removeReaction(messageId: string, userId: string): Promise<void>;
  listReactions(messageIds: readonly string[]): Promise<ReactionRow[]>;

  upsertReceipt(row: ReceiptRow): Promise<void>;
  listReceipts(messageIds: readonly string[]): Promise<ReceiptRow[]>;

  putOutbox(row: OutboxRow): Promise<void>;
  /** Rows due at `now`, fewest attempts first. Rows stay until deleted. */
  takeOutbox(now: string, limit?: number): Promise<OutboxRow[]>;
  deleteOutbox(id: string): Promise<void>;

  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string): Promise<void>;
  listKv(prefix: string): Promise<{ key: string; value: string }[]>;

  /** Drops all user data (logout). The schema is recreated empty. */
  wipe(): Promise<void>;

  subscribe(listener: (change: LocalStoreChange) => void): () => void;
}

const SCHEMA_VERSION_KEY = "schema_version";
const DEFAULT_PAGE = 50;

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

export function createSqlLocalStore(db: SqlExecutor): LocalStore {
  const listeners = new Set<(change: LocalStoreChange) => void>();
  const emit = (change: LocalStoreChange) => {
    for (const l of [...listeners]) {
      try {
        l(change);
      } catch {
        // a broken listener must not break writes
      }
    }
  };

  async function applySchema() {
    for (const sql of LOCAL_SCHEMA_STATEMENTS) {
      await db.exec(sql);
    }
    await db.exec(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [
      SCHEMA_VERSION_KEY,
      String(LOCAL_SCHEMA_VERSION),
    ]);
  }

  return {
    async init() {
      await applySchema();
    },

    async upsertConversations(rows) {
      if (rows.length === 0) return;
      await db.transaction(async () => {
        for (const r of rows) {
          await db.exec(
            `INSERT OR REPLACE INTO conversations
             (id, kind, title, avatar, last_message_id, unread_count, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [r.id, r.kind, r.title, r.avatar, r.last_message_id, r.unread_count, r.updated_at],
          );
        }
      });
      emit({ table: "conversations" });
    },
    async getConversation(id) {
      const rows = await db.query<ConversationRow>(
        `SELECT * FROM conversations WHERE id = ?`,
        [id],
      );
      return rows[0] ?? null;
    },
    listConversations() {
      return db.query<ConversationRow>(
        `SELECT * FROM conversations ORDER BY updated_at IS NULL, updated_at DESC, id DESC`,
      );
    },

    async upsertMessages(rows) {
      if (rows.length === 0) return;
      await db.transaction(async () => {
        for (const r of rows) {
          // ON CONFLICT DO UPDATE keeps the rowid stable for the FTS external-content table.
          await db.exec(
            `INSERT INTO messages
             (id, conversation_id, sender_user_id, sender_device_id, sent_at, received_at,
              kind, body, reply_to_id, edited_at, deleted, status, media_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
              conversation_id = excluded.conversation_id,
              sender_user_id = excluded.sender_user_id,
              sender_device_id = excluded.sender_device_id,
              sent_at = excluded.sent_at,
              received_at = COALESCE(messages.received_at, excluded.received_at),
              kind = excluded.kind,
              body = excluded.body,
              reply_to_id = excluded.reply_to_id,
              edited_at = excluded.edited_at,
              deleted = excluded.deleted,
              status = excluded.status,
              media_json = excluded.media_json`,
            [
              r.id,
              r.conversation_id,
              r.sender_user_id,
              r.sender_device_id,
              r.sent_at,
              r.received_at,
              r.kind,
              r.body,
              r.reply_to_id,
              r.edited_at,
              r.deleted,
              r.status,
              r.media_json,
            ],
          );
        }
      });
      for (const id of new Set(rows.map((r) => r.conversation_id))) {
        emit({ table: "messages", conversationId: id });
      }
    },
    async getMessage(id) {
      const rows = await db.query<MessageRow>(`SELECT * FROM messages WHERE id = ?`, [id]);
      return rows[0] ?? null;
    },
    listMessages(conversationId, opts) {
      const limit = opts?.limit ?? DEFAULT_PAGE;
      const params: SqlValue[] = [conversationId];
      let where = `conversation_id = ?`;
      if (opts?.before) {
        where += ` AND (sent_at < ? OR (sent_at = ? AND id < ?))`;
        params.push(opts.before.sentAt, opts.before.sentAt, opts.before.id);
      }
      params.push(limit);
      return db.query<MessageRow>(
        `SELECT * FROM messages WHERE ${where} ORDER BY sent_at DESC, id DESC LIMIT ?`,
        params,
      );
    },
    async countMessages(conversationId) {
      const rows = await db.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?`,
        [conversationId],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async setReaction(row) {
      await db.exec(
        `INSERT OR REPLACE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`,
        [row.message_id, row.user_id, row.emoji],
      );
      emit({ table: "reactions" });
    },
    async removeReaction(messageId, userId) {
      await db.exec(`DELETE FROM reactions WHERE message_id = ? AND user_id = ?`, [
        messageId,
        userId,
      ]);
      emit({ table: "reactions" });
    },
    async listReactions(messageIds) {
      if (messageIds.length === 0) return [];
      return db.query<ReactionRow>(
        `SELECT * FROM reactions WHERE message_id IN (${placeholders(messageIds.length)})`,
        messageIds,
      );
    },

    async upsertReceipt(row) {
      await db.exec(
        `INSERT OR REPLACE INTO receipts (message_id, user_id, delivered_at, read_at)
         VALUES (?, ?, ?, ?)`,
        [row.message_id, row.user_id, row.delivered_at, row.read_at],
      );
      emit({ table: "receipts" });
    },
    async listReceipts(messageIds) {
      if (messageIds.length === 0) return [];
      return db.query<ReceiptRow>(
        `SELECT * FROM receipts WHERE message_id IN (${placeholders(messageIds.length)})`,
        messageIds,
      );
    },

    async putOutbox(row) {
      await db.exec(
        `INSERT OR REPLACE INTO outbox (id, payload, attempts, next_attempt_at)
         VALUES (?, ?, ?, ?)`,
        [row.id, row.payload, row.attempts, row.next_attempt_at],
      );
      emit({ table: "outbox" });
    },
    takeOutbox(now, limit = 20) {
      return db.query<OutboxRow>(
        `SELECT * FROM outbox WHERE next_attempt_at IS NULL OR next_attempt_at <= ?
         ORDER BY attempts ASC, rowid ASC LIMIT ?`,
        [now, limit],
      );
    },
    async deleteOutbox(id) {
      await db.exec(`DELETE FROM outbox WHERE id = ?`, [id]);
      emit({ table: "outbox" });
    },

    async getKv(key) {
      const rows = await db.query<{ value: string | null }>(
        `SELECT value FROM kv WHERE key = ?`,
        [key],
      );
      return rows[0]?.value ?? null;
    },
    async setKv(key, value) {
      await db.exec(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [key, value]);
      emit({ table: "kv" });
    },
    async listKv(prefix) {
      const escaped = prefix.replace(/[\\%_]/g, (c) => "\\" + c);
      return db.query<{ key: string; value: string }>(
        `SELECT key, value FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key`,
        [escaped + "%"],
      );
    },

    async wipe() {
      await db.transaction(async () => {
        // Deleting messages fires the FTS delete trigger, which empties the index too.
        for (const t of [
          "messages",
          "conversations",
          "reactions",
          "receipts",
          "outbox",
          "media",
          "crypto_state",
          "kv",
        ]) {
          await db.exec(`DELETE FROM ${t}`);
        }
      });
      await applySchema();
      emit({ table: "all" });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
