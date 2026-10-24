import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import type { LocalStore, MessageRow, SqlExecutor } from "@pulse/core/local-store";
import { rpcMessageToRow } from "@pulse/core/local-store";
import { createOutbox, type Outbox, type SendOutcome } from "@pulse/core/local-store/outbox";
import type { RpcMessageRow } from "@pulse/core/messaging-types";
import type { Result } from "@pulse/core/result";

import { getLocalDb } from "@/platform/local-store";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import { asRpcClient } from "@pulse/core/rpc";

import { createMailboxTextSender } from "./mailbox-send";

export type TextPayload = {
  conversationId: string;
  clientId: string;
  body: string;
  replyToId?: string | null;
};

export type TextOutboxEvents = {
  onSent(clientId: string, message: RpcMessageRow): void;
  onFailed(clientId: string): void;
};

export type TextOutbox = {
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
      sent.set(entry.id, res.value);
      return { status: "sent", message: rpcMessageToRow(res.value, new Date().toISOString()) };
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
      return outbox.enqueue(row, JSON.stringify(p));
    },
    async listPending() {
      const rows = await outbox.listUnsent();
      return rows.map((r) => ({
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
            // With the flag on, sends go through the mailbox (send_envelopes).
            sendText: createMailboxTextSender({
              client: asRpcClient(createSupabaseBrowserClient()),
              userId,
            }),
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
