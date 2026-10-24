import {
  conversationPageNextCursor,
  err,
  messagePageNextCursor,
  ok,
  type ConversationSummary,
  type ListConversationsResult,
  type ListMessagesResult,
  type Result,
  type RpcMessageRow,
  type TimelineMessage,
} from "@pulse/core";

import type { LocalDb } from "./db";
import { createLocalFirstSource, type ListConversationsArgs, type LocalFirstSource } from "./local-first-source";
import { searchLocalMessages, type SearchHit } from "./search";
import { createTextOutbox, type TextOutbox, type TextPayload } from "./text-outbox";

export type ChatPage<T> = { items: T[]; hasMore: boolean; nextCursor: string | null };

export type LocalChatDeps = {
  /** The local database, or null when the e2ee flag is off or SQLite is unavailable. */
  getDb(): Promise<LocalDb | null>;
  getUserId(): Promise<string | null>;
  remote: {
    listConversations(args: ListConversationsArgs): Promise<Result<ListConversationsResult>>;
    listMessages(input: { conversationId: string; cursor?: string | null }): Promise<Result<ListMessagesResult>>;
  };
  sendText(input: TextPayload): Promise<Result<RpcMessageRow>>;
  now?: () => number;
};

export type LocalChatData = {
  /** Null means "not handled locally": the caller uses the network path as before. */
  listChats(args: ListConversationsArgs): Promise<Result<ChatPage<ConversationSummary>> | null>;
  listMessages(conversationId: string, cursor: string | null): Promise<Result<ChatPage<RpcMessageRow>> | null>;
  sendText(input: TextPayload): Promise<Result<TimelineMessage> | null>;
  search(text: string, opts?: { conversationId?: string; limit?: number }): Promise<SearchHit[] | null>;
  /** Fires when a queued send was delivered or failed for good. */
  onOutboxChange(listener: () => void): () => void;
  /** Resumes unsent messages of earlier sessions (call after sign-in). */
  resume(): Promise<void>;
  /** Drops cached handles (logout). */
  reset(): void;
};

function pendingToTimeline(
  p: TextPayload & { createdAt: string; status: "pending" | "failed" },
  userId: string,
): TimelineMessage {
  return {
    id: p.clientId,
    conversation_id: p.conversationId,
    sender_id: userId,
    client_id: p.clientId,
    type: "text",
    body: p.body,
    reply_to_id: p.replyToId ?? null,
    created_at: p.createdAt,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    status: p.status,
  };
}

export function createLocalChatData(deps: LocalChatDeps): LocalChatData {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  let cached: { db: LocalDb; source: LocalFirstSource } | null = null;
  let outbox: { userId: string; box: TextOutbox } | null = null;

  async function source() {
    const db = await deps.getDb();
    if (!db) return null;
    if (!cached || cached.db !== db) {
      cached = { db, source: createLocalFirstSource(db.store, deps.remote) };
    }
    return cached;
  }

  async function textOutbox(): Promise<TextOutbox | null> {
    const s = await source();
    const userId = await deps.getUserId();
    if (!s || !userId) return null;
    if (!outbox || outbox.userId !== userId) {
      outbox?.box.stop();
      const box = createTextOutbox({
        db: s.db.db,
        store: s.db.store,
        sendText: deps.sendText,
        events: () => ({ onSent: notify, onFailed: notify }),
        userId,
        now: deps.now,
      });
      box.start();
      outbox = { userId, box };
    }
    return outbox.box;
  }

  return {
    async listChats(args) {
      const s = await source();
      if (!s) return null;
      const res = await s.source.listConversations(args);
      if (!res.ok) return res;
      const { items, hasMore } = res.value;
      return ok({ items, hasMore, nextCursor: hasMore ? conversationPageNextCursor(items) : null });
    },

    async listMessages(conversationId, cursor) {
      const s = await source();
      if (!s) return null;
      const res = await s.source.listMessages({ conversationId, cursor });
      if (!res.ok) return res;
      const { items, hasMore } = res.value;
      let out: (RpcMessageRow | TimelineMessage)[] = items;
      if (!cursor) {
        // Unsent sends show as pending/failed bubbles on top of the newest page (list is newest first).
        const box = await textOutbox();
        const userId = await deps.getUserId();
        if (box && userId) {
          const pending = (await box.listPending())
            .filter((p) => p.conversationId === conversationId)
            .map((p) => pendingToTimeline(p, userId))
            .reverse();
          out = [...pending, ...items];
        }
      }
      return ok({
        items: out as RpcMessageRow[],
        hasMore,
        nextCursor: hasMore ? messagePageNextCursor(items) : null,
      });
    },

    async sendText(input) {
      const box = await textOutbox();
      const userId = await deps.getUserId();
      if (!box || !userId) return null;
      const createdAt = new Date((deps.now ?? Date.now)()).toISOString();
      const queued = await box.enqueueText(input, createdAt);
      if (!queued) return err("platform.unexpected");
      void box.drain({ force: true }).then(notify, notify);
      return ok(pendingToTimeline({ ...input, createdAt, status: "pending" }, userId));
    },

    async search(text, opts) {
      const s = await source();
      return s ? searchLocalMessages(s.db.db, text, opts) : null;
    },

    onOutboxChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async resume() {
      await textOutbox();
    },

    reset() {
      outbox?.box.stop();
      outbox = null;
      cached = null;
    },
  };
}

