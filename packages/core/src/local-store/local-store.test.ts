import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore, type LocalStoreChange } from "./local-store";
import { rowToRpcMessage, rowToSummary, rpcMessageToRow, summaryToRow } from "./mappers";
import { createNodeSqliteExecutor } from "./node-sqlite-executor";
import { LOCAL_SCHEMA_VERSION, LOCAL_TABLES } from "./schema";
import type { MessageRow } from "./types";
import type { RpcMessageRow } from "../messaging-types";

function msg(id: string, sentAt: string, conv = "c1", body = "hello"): MessageRow {
  return {
    id,
    conversation_id: conv,
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: sentAt,
    received_at: sentAt,
    kind: "text",
    body,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
  };
}

function conv(id: string, updatedAt: string, title = id, unread = 0) {
  return {
    id,
    kind: "direct",
    title,
    avatar: null,
    last_message_id: null,
    unread_count: unread,
    updated_at: updatedAt,
  };
}

describe("LocalStore over SQLite", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;

  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
  });
  afterEach(() => exec.close());

  it("creates every spec 6.2 table and records the schema version", async () => {
    const rows = await exec.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = rows.map((r) => r.name);
    for (const t of LOCAL_TABLES) expect(names).toContain(t);
    expect(await store.getKv("schema_version")).toBe(String(LOCAL_SCHEMA_VERSION));
  });

  it("upserts and lists conversations newest first", async () => {
    await store.upsertConversations([
      conv("a", "2026-01-01T00:00:00Z"),
      conv("b", "2026-02-01T00:00:00Z"),
    ]);
    await store.upsertConversations([conv("a", "2026-03-01T00:00:00Z", "A2", 1)]);
    const list = await store.listConversations();
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list[0]?.title).toBe("A2");
  });

  it("pages messages by sent_at, newest first", async () => {
    await store.upsertMessages([
      msg("m1", "2026-01-01T00:00:01Z"),
      msg("m2", "2026-01-01T00:00:02Z"),
      msg("m3", "2026-01-01T00:00:03Z"),
      msg("x", "2026-01-01T00:00:09Z", "other"),
    ]);
    const first = await store.listMessages("c1", { limit: 2 });
    expect(first.map((m) => m.id)).toEqual(["m3", "m2"]);
    const last = first[first.length - 1]!;
    const next = await store.listMessages("c1", {
      limit: 2,
      before: { sentAt: last.sent_at, id: last.id },
    });
    expect(next.map((m) => m.id)).toEqual(["m1"]);
    expect(await store.countMessages("c1")).toBe(3);
  });

  it("keeps the FTS index in step through insert and update", async () => {
    const hit = (term: string) =>
      exec.query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?", [term]);
    await store.upsertMessages([msg("m1", "2026-01-01T00:00:01Z", "c1", "banana split")]);
    expect(await hit("banana")).toHaveLength(1);
    await store.upsertMessages([msg("m1", "2026-01-01T00:00:01Z", "c1", "cherry pie")]);
    expect(await hit("banana")).toHaveLength(0);
    expect(await hit("cherry")).toHaveLength(1);
  });

  it("handles reactions, receipts and the outbox", async () => {
    await store.setReaction({ message_id: "m1", user_id: "u1", emoji: "a" });
    await store.setReaction({ message_id: "m1", user_id: "u1", emoji: "b" });
    expect(await store.listReactions(["m1"])).toEqual([
      { message_id: "m1", user_id: "u1", emoji: "b" },
    ]);
    await store.removeReaction("m1", "u1");
    expect(await store.listReactions(["m1"])).toEqual([]);

    await store.upsertReceipt({ message_id: "m1", user_id: "u2", delivered_at: "t", read_at: null });
    expect((await store.listReceipts(["m1"]))[0]?.delivered_at).toBe("t");

    await store.putOutbox({ id: "o1", payload: "{}", attempts: 0, next_attempt_at: null });
    await store.putOutbox({
      id: "o2",
      payload: "{}",
      attempts: 1,
      next_attempt_at: "2099-01-01T00:00:00Z",
    });
    expect((await store.takeOutbox("2026-01-01T00:00:00Z")).map((o) => o.id)).toEqual(["o1"]);
    await store.deleteOutbox("o1");
    expect(await store.takeOutbox("2026-01-01T00:00:00Z")).toEqual([]);
  });

  it("kv get, set and prefix list", async () => {
    await store.setKv("cursor:a", "1");
    await store.setKv("cursor:b", "2");
    await store.setKv("other", "3");
    expect(await store.getKv("cursor:a")).toBe("1");
    expect((await store.listKv("cursor:")).map((r) => r.key)).toEqual(["cursor:a", "cursor:b"]);
  });

  it("notifies subscribers on writes and stops after unsubscribe", async () => {
    const seen: LocalStoreChange[] = [];
    const off = store.subscribe((c) => seen.push(c));
    await store.upsertMessages([msg("m1", "2026-01-01T00:00:01Z")]);
    expect(seen).toEqual([{ table: "messages", conversationId: "c1" }]);
    off();
    await store.upsertMessages([msg("m2", "2026-01-01T00:00:02Z")]);
    expect(seen).toHaveLength(1);
  });

  it("wipe removes all data but leaves a usable schema", async () => {
    await store.upsertMessages([msg("m1", "2026-01-01T00:00:01Z", "c1", "zebra")]);
    await store.setKv("x", "y");
    await store.wipe();
    expect(await store.countMessages("c1")).toBe(0);
    expect(await store.getKv("x")).toBeNull();
    expect(
      await exec.query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?", ["zebra"]),
    ).toHaveLength(0);
    await store.upsertMessages([msg("m2", "2026-01-01T00:00:02Z")]);
    expect(await store.countMessages("c1")).toBe(1);
  });
});

describe("mappers", () => {
  it("round-trips a server message", () => {
    const rpc: RpcMessageRow = {
      id: "m1",
      conversation_id: "c1",
      sender_id: "u1",
      client_id: "cl1",
      type: "text",
      body: "hi",
      reply_to_id: null,
      created_at: "2026-01-01T00:00:00Z",
      edited_at: null,
      deleted_at: null,
      deletion_scope: "none",
      pinned_at: "p",
      forwarded: true,
      metadata: { a: 1 },
      attachments: [],
      reactions: [],
    };
    expect(rowToRpcMessage(rpcMessageToRow(rpc, "now"))).toEqual(rpc);
  });

  it("round-trips a conversation summary", () => {
    const s = {
      id: "c1",
      type: "direct" as const,
      title: null,
      last_message_at: "t",
      last_message_id: "m",
      last_message_preview: "hey",
      last_message_deletion_scope: "none" as const,
      unread_count: 3,
      pinned_at: "p",
      archived_at: null,
      muted_until: null,
      other_user_id: "u2",
      other_username: "bob",
      other_display_name: "Bob",
      other_avatar_url: "a.png",
    };
    const { row, extra } = summaryToRow({ ...s, has_more: true });
    expect(rowToSummary(row, extra)).toEqual(s);
  });
});
