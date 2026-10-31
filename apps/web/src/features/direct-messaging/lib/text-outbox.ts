import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import type { LocalStore, MessageRow, SqlExecutor } from "@pulse/core/local-store";
import { rowToRpcMessage, rpcMessageToRow } from "@pulse/core/local-store";
import type { MediaBody } from "@pulse/core/e2ee/plain-envelope";
import { createOutbox, type Outbox, type SendOutcome } from "@pulse/core/local-store/outbox";
import type { RpcMessageRow } from "@pulse/core/messaging-types";
import type { Result } from "@pulse/core/result";

import { getLocalDb } from "@/platform/local-store";

import { getE2eeRuntime } from "@/platform/crypto/e2ee-runtime";

export type TextPayload = {
  conversationId: string;
  clientId: string;
  body: string;
  replyToId?: string | null;
  /** Set for an encrypted media message: `body` is then the caption and the file is already uploaded. */
  media?: MediaBody;
};

/** Local row of a media message: kind "media" keeps the reference (spec 9.1). */
function mediaRow(p: TextPayload & { media: MediaBody }, base: MessageRow): MessageRow {
  return {
    ...base,
    kind: "media",
    body: p.media.caption ?? (p.body || null),
    media_json: JSON.stringify({ client_id: p.clientId, ...p.media, expired: false }),
  };
}

export type TextOutboxEvents = {
  onSent(clientId: string, message: RpcMessageRow): void;
  onFailed(clientId: string): void;
};

export type TextOutbox = {
  /** Queues a send; for a payload with `media` the local row is the media message. */
  enqueueText(p: TextPayload, createdAt: string): Promise<boolean>;
  /** Unsent sends of earlier sessions (and this one), oldest first, for restoring bubbles. */
  listPending(): Promise<(TextPayload & { createdAt: string; status: "pending" | "failed" })[]>;
  drain(opts?: { force?: boolean }): Promise<void>;
  start(): void;
  stop(): void;
};

/** The outbox for text sends: payload is a TextPayload, delivery is the send RPC (idempotent by client id). */
export function createTextOutbox(args: {
  db: SqlExecutor;
  store: LocalStore;
  sendText: (input: TextPayload) => Promise<Result<RpcMessageRow>>;
  events: () => TextOutboxEvents;
  userId: string;
  now?: () => number;
}): TextOutbox {
  const sent = new Map<string, RpcMessageRow>();
  const outbox: Outbox = createOutbox({
    db: args.db,
    store: args.store,
    now: args.now,
    async send(entry): Promise<SendOutcome> {
      const payload = JSON.parse(entry.payload) as TextPayload;
      // A thrown error (network drop) is retried with backoff by the outbox.
      const res = await args.sendText(payload);
      if (!res.ok) return { status: "failed", reason: res.error.code };
      const row = rpcMessageToRow(res.value, new Date().toISOString());
      if (payload.media) {
        const media = mediaRow({ ...payload, media: payload.media }, row);
        sent.set(entry.id, rowToRpcMessage(media));
        return { status: "sent", message: media };
      }
      sent.set(entry.id, res.value);
      return { status: "sent", message: row };
    },
    onSettled(entry, outcome) {
      const message = sent.get(entry.id);
      sent.delete(entry.id);
      if (outcome.status === "sent" && message) args.events().onSent(entry.id, message);
      else if (outcome.status === "failed") args.events().onFailed(entry.id);
    },
  });
  return {
    drain: (o) => outbox.drain(o),
    start: () => outbox.start(),
    stop: () => outbox.stop(),
    enqueueText(p, createdAt) {
      const row: MessageRow = {
        id: p.clientId,
        conversation_id: p.conversationId,
        sender_user_id: args.userId,
        sender_device_id: null,
        sent_at: createdAt,
        received_at: null,
        kind: "text",
        body: p.body,
        reply_to_id: p.replyToId ?? null,
        edited_at: null,
        deleted: 0,
        status: "pending",
        media_json: JSON.stringify({ client_id: p.clientId }),
      };
      return outbox.enqueue(p.media ? mediaRow({ ...p, media: p.media }, row) : row, JSON.stringify(p));
    },
    async listPending() {
      const rows = await outbox.listUnsent();
      // Media rows are resent from the stored payload; a text bubble for them would be empty.
      return rows.filter((r) => r.kind !== "media").map((r) => ({
        clientId: r.id,
        conversationId: r.conversation_id,
        body: r.body ?? "",
        replyToId: r.reply_to_id,
        createdAt: r.sent_at,
        status: r.status === "failed" ? ("failed" as const) : ("pending" as const),
      }));
    },
  };
}

let current: { userId: string; promise: Promise<TextOutbox | null> } | null = null;
let events: TextOutboxEvents = { onSent() {}, onFailed() {} };

/** The provider registers its dispatchers here; the outbox outlives re-renders. */
export function setTextOutboxEvents(next: TextOutboxEvents): void {
  events = next;
}

/** The text outbox, or null when the e2ee flag is off or the local DB is unavailable. */
export function getTextOutbox(userId: string): Promise<TextOutbox | null> {
  if (!isE2eeEnabled()) return Promise.resolve(null);
  if (!current || current.userId !== userId) {
    current = {
      userId,
      promise: getLocalDb()
        .then((h) => {
          if (!h) return null;
          const box = createTextOutbox({
            db: h.db,
            store: h.store,
            // Ciphertext only: the plaintext send action is never used with the flag on.
            sendText: async (input) => {
              const rt = await getE2eeRuntime(userId);
              if (!rt) throw new Error("e2ee.runtime_unavailable"); // retried with backoff
              return rt.sendText(input);
            },
            events: () => events,
            userId,
          });
          box.start();
          return box;
        })
        .catch(() => null),
    };
  }
  return current.promise;
}

/** Logout: the local DB is gone, so the next sign-in builds a fresh outbox. */
export function resetTextOutbox(): void {
  void current?.promise.then((b) => b?.stop());
  current = null;
}
