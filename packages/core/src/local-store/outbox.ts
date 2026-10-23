import type { LocalStore } from "./local-store";
import type { MessageRow, OutboxRow, SqlExecutor } from "./types";

/**
 * Spec 5.2 step 1: a send writes the message (status pending) and an outbox row in one
 * local transaction; a drainer then delivers it with retries and exponential backoff.
 * The outbox id is the client id and is also the pending message id, so a resend after a
 * crash or a lost ack is the same send: the server dedupes on that client id.
 */
export const MESSAGE_STATUS_PENDING = "pending";
export const MESSAGE_STATUS_FAILED = "failed";

export type OutboxEntry = { id: string; payload: string; attempts: number };

export type SendOutcome =
  /** Delivered. `message` is the server row; it replaces the pending local row. */
  | { status: "sent"; message?: MessageRow }
  /** Temporary failure (offline, 5xx): try again later with backoff. */
  | { status: "retry" }
  /** Permanent failure: the message is marked failed and leaves the outbox. */
  | { status: "failed"; reason?: string };

export type OutboxOptions = {
  db: SqlExecutor;
  store: LocalStore;
  send(entry: OutboxEntry): Promise<SendOutcome>;
  /** Called after an entry settles (sent or failed), once its transaction committed. */
  onSettled?(entry: OutboxEntry, outcome: SendOutcome): void;
  /** Milliseconds since epoch. Injectable for tests. */
  now?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export interface Outbox {
  /** Writes the pending message and the outbox row atomically. False when already queued. */
  enqueue(message: MessageRow, payload: string): Promise<boolean>;
  /** Messages still waiting or failed, oldest first (used to restore bubbles after a reload). */
  listUnsent(): Promise<MessageRow[]>;
  /** Delivers due rows in order. `force` ignores backoff (connection came back). */
  drain(opts?: { force?: boolean }): Promise<void>;
  /** Resumes whatever is stored (after a reload) and keeps a timer for the next retry. */
  start(): Promise<void>;
  stop(): void;
}

export function backoffDelayMs(attempts: number, base = 1000, max = 5 * 60_000): number {
  return Math.min(max, base * 2 ** Math.min(attempts, 30));
}

export function createOutbox(opts: OutboxOptions): Outbox {
  const { db, store } = opts;
  const now = opts.now ?? Date.now;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining: Promise<void> | null = null;
  let rerun: { force: boolean } | null = null;

  const iso = (ms: number) => new Date(ms).toISOString();

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function schedule() {
    clearTimer();
    if (!started) return;
    const head = (
      await db.query<OutboxRow>(`SELECT * FROM outbox ORDER BY rowid ASC LIMIT 1`)
    )[0];
    if (!head) return;
    const due = head.next_attempt_at ? Date.parse(head.next_attempt_at) : 0;
    timer = setTimeout(() => void drain(), Math.max(0, due - now()));
  }

  async function settle(entry: OutboxEntry, outcome: SendOutcome) {
    if (outcome.status === "sent") {
      await db.transaction(async () => {
        if (outcome.message) {
          await db.exec(`DELETE FROM messages WHERE id = ?`, [entry.id]);
          await store.upsertMessages([outcome.message]);
        } else {
          const row = await store.getMessage(entry.id);
          if (row) await store.upsertMessages([{ ...row, status: null }]);
        }
        await store.deleteOutbox(entry.id);
      });
    } else if (outcome.status === "failed") {
      await db.transaction(async () => {
        const row = await store.getMessage(entry.id);
        if (row) await store.upsertMessages([{ ...row, status: MESSAGE_STATUS_FAILED }]);
        await store.deleteOutbox(entry.id);
      });
    }
    opts.onSettled?.(entry, outcome);
  }

  async function runPass(force: boolean) {
    for (;;) {
      const head = (
        await db.query<OutboxRow>(`SELECT * FROM outbox ORDER BY rowid ASC LIMIT 1`)
      )[0];
      if (!head) return;
      if (!force && head.next_attempt_at && Date.parse(head.next_attempt_at) > now()) return;
      const entry: OutboxEntry = { id: head.id, payload: head.payload, attempts: head.attempts };
      let outcome: SendOutcome;
      try {
        outcome = await opts.send(entry);
      } catch {
        outcome = { status: "retry" };
      }
      if (outcome.status === "retry") {
        // Head of line stays put so messages keep their order; its backoff gates the rest.
        const attempts = head.attempts + 1;
        await db.exec(`UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?`, [
          attempts,
          iso(now() + backoffDelayMs(head.attempts, opts.baseDelayMs, opts.maxDelayMs)),
          head.id,
        ]);
        return;
      }
      await settle(entry, outcome);
      force = false;
    }
  }

  function drain(o?: { force?: boolean }): Promise<void> {
    const force = o?.force ?? false;
    if (draining) {
      rerun = { force: force || (rerun?.force ?? false) };
      return draining;
    }
    draining = (async () => {
      try {
        let next: { force: boolean } | null = { force };
        while (next) {
          rerun = null;
          await runPass(next.force);
          next = rerun;
        }
      } finally {
        draining = null;
        await schedule().catch(() => undefined);
      }
    })();
    return draining;
  }

  return {
    async enqueue(message, payload) {
      const queued = await db.transaction(async () => {
        const existing = await db.query(`SELECT id FROM outbox WHERE id = ?`, [message.id]);
        if (existing.length > 0) return false;
        await store.upsertMessages([{ ...message, status: MESSAGE_STATUS_PENDING }]);
        await db.exec(
          `INSERT INTO outbox (id, payload, attempts, next_attempt_at) VALUES (?, ?, 0, NULL)`,
          [message.id, payload],
        );
        return true;
      });
      if (queued) {
        if (started) void drain();
      }
      return queued;
    },
    listUnsent() {
      return db.query<MessageRow>(
        `SELECT * FROM messages WHERE status IN (?, ?) ORDER BY sent_at ASC, id ASC`,
        [MESSAGE_STATUS_PENDING, MESSAGE_STATUS_FAILED],
      );
    },
    drain,
    async start() {
      started = true;
      await drain();
    },
    stop() {
      started = false;
      clearTimer();
    },
  };
}
