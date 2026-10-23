import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqlLocalStore, type LocalStore } from "./local-store";
import { createNodeSqliteExecutor } from "./node-sqlite-executor";
import {
  backoffDelayMs,
  createOutbox,
  type Outbox,
  type OutboxEntry,
  type SendOutcome,
} from "./outbox";
import type { MessageRow } from "./types";

function msg(id: string, sentAt = "2026-01-01T00:00:00.000Z"): MessageRow {
  return {
    id,
    conversation_id: "c1",
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: sentAt,
    received_at: null,
    kind: "text",
    body: "hello " + id,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
  };
}

const server = (id: string): MessageRow => ({ ...msg("srv-" + id), status: null });

describe("outbox", () => {
  let db: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  const send = vi.fn<(e: OutboxEntry) => Promise<SendOutcome>>();

  const make = (): Outbox =>
    createOutbox({ db, store, send, now: () => clock, baseDelayMs: 1000, maxDelayMs: 8000 });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    db = createNodeSqliteExecutor();
    store = createSqlLocalStore(db);
    await store.init();
    send.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  const advance = async (ms: number) => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };

  it("enqueue writes a pending message and an outbox row together", async () => {
    const outbox = make();
    expect(await outbox.enqueue(msg("a"), '{"x":1}')).toBe(true);
    expect((await store.getMessage("a"))?.status).toBe("pending");
    expect(await store.takeOutbox(new Date(clock).toISOString())).toMatchObject([
      { id: "a", payload: '{"x":1}', attempts: 0 },
    ]);
  });

  it("enqueue is atomic: a failing outbox insert leaves no message behind", async () => {
    const outbox = make();
    await expect(outbox.enqueue(msg("a"), null as unknown as string)).rejects.toThrow();
    expect(await store.getMessage("a")).toBeNull();
    expect(await db.query(`SELECT * FROM outbox`)).toEqual([]);
  });

  it("enqueue twice with the same client id queues once", async () => {
    const outbox = make();
    expect(await outbox.enqueue(msg("a"), "p")).toBe(true);
    expect(await outbox.enqueue(msg("a"), "p")).toBe(false);
    expect(await db.query(`SELECT * FROM outbox`)).toHaveLength(1);
  });

  it("drain sends, replaces the pending row with the server row and clears the outbox", async () => {
    send.mockResolvedValue({ status: "sent", message: server("a") });
    const outbox = make();
    await outbox.enqueue(msg("a"), "p");
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await store.getMessage("a")).toBeNull();
    expect(await store.getMessage("srv-a")).not.toBeNull();
    expect(await db.query(`SELECT * FROM outbox`)).toEqual([]);
    expect(await outbox.listUnsent()).toEqual([]);
  });

  it("retries with exponential backoff and delivers once, never twice", async () => {
    send
      .mockResolvedValueOnce({ status: "retry" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "sent", message: server("a") });
    const outbox = make();
    await outbox.start();
    await outbox.enqueue(msg("a"), "p");
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    await advance(999);
    expect(send).toHaveBeenCalledTimes(1);
    await advance(1); // 1 s backoff elapsed
    expect(send).toHaveBeenCalledTimes(2);

    await advance(1999);
    expect(send).toHaveBeenCalledTimes(2);
    await advance(1); // 2 s backoff
    expect(send).toHaveBeenCalledTimes(3);

    await advance(60_000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(await store.countMessages("c1")).toBe(1);
    outbox.stop();
  });

  it("caps the backoff delay", () => {
    expect(backoffDelayMs(0, 1000, 8000)).toBe(1000);
    expect(backoffDelayMs(2, 1000, 8000)).toBe(4000);
    expect(backoffDelayMs(10, 1000, 8000)).toBe(8000);
  });

  it("force drain ignores the backoff (connection came back)", async () => {
    send.mockResolvedValueOnce({ status: "retry" }).mockResolvedValueOnce({
      status: "sent",
      message: server("a"),
    });
    const outbox = make();
    await outbox.enqueue(msg("a"), "p");
    await outbox.drain();
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(1);
    await outbox.drain({ force: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps order: a backing-off head holds later messages", async () => {
    send.mockResolvedValueOnce({ status: "retry" });
    const outbox = make();
    await outbox.enqueue(msg("a"), "pa");
    await outbox.enqueue(msg("b", "2026-01-01T00:00:01.000Z"), "pb");
    await outbox.drain();
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe("a");
  });

  it("a permanent failure marks the message failed and unblocks the queue", async () => {
    send
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "sent", message: server("b") });
    const outbox = make();
    await outbox.enqueue(msg("a"), "pa");
    await outbox.enqueue(msg("b", "2026-01-01T00:00:01.000Z"), "pb");
    await outbox.drain();
    expect((await store.getMessage("a"))?.status).toBe("failed");
    expect(await store.getMessage("srv-b")).not.toBeNull();
    expect((await outbox.listUnsent()).map((m) => m.id)).toEqual(["a"]);
  });

  it("resumes after reopen: a new outbox on the same database sends what was left", async () => {
    send.mockResolvedValue({ status: "retry" });
    const first = make();
    await first.enqueue(msg("a"), "p");
    await first.drain();
    first.stop();

    // "Reload": a fresh store and outbox over the same data.
    const reopened = createOutbox({
      db,
      store: createSqlLocalStore(db),
      send,
      now: () => clock,
      baseDelayMs: 1000,
    });
    expect((await reopened.listUnsent()).map((m) => m.id)).toEqual(["a"]);
    send.mockResolvedValue({ status: "sent", message: server("a") });
    await advance(1000);
    await reopened.start();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ id: "a", attempts: 1 });
    expect(await db.query(`SELECT * FROM outbox`)).toEqual([]);
    reopened.stop();
  });

  it("a lost ack resends the same client id (idempotent key)", async () => {
    send
      .mockRejectedValueOnce(new Error("ack lost"))
      .mockResolvedValueOnce({ status: "sent", message: server("a") });
    const outbox = make();
    await outbox.enqueue(msg("a"), "p");
    await outbox.drain();
    await outbox.drain({ force: true });
    expect(send.mock.calls.map((c) => c[0].id)).toEqual(["a", "a"]);
    expect(await store.countMessages("c1")).toBe(1);
  });
});
