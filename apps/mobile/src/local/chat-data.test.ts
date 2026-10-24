import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { err, ok, type RpcMessageRow } from "@pulse/core";
import { createSqlLocalStore } from "@pulse/core/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";

import { createLocalChatData } from "./chat-data";
import { createExpoSqliteExecutor, type ExpoDatabaseLike } from "./expo-sqlite-executor";

function msg(id: string, body: string, at: string, conv = "c1"): RpcMessageRow {
  return {
    id, conversation_id: conv, sender_id: "u2", client_id: id, type: "text", body,
    reply_to_id: null, created_at: at, edited_at: null, deleted_at: null,
    deletion_scope: "none", pinned_at: null, forwarded: false, metadata: null,
  };
}

const summary = {
  id: "c1", type: "direct" as const, title: "Ana", last_message_at: "2026-01-01T00:00:03.000Z",
  last_message_preview: "hello", unread_count: 0,
} as never;

/** Opens a file-backed db like expo-sqlite would, through the expo executor adapter. */
function openFile(path: string) {
  const node = createNodeSqliteExecutor(path);
  const raw: ExpoDatabaseLike = {
    execAsync: (sql) => node.exec(sql),
    runAsync: (sql, p) => node.exec(sql, p),
    getAllAsync: (sql, p) => node.query(sql, p),
  };
  const db = createExpoSqliteExecutor(raw);
  const store = createSqlLocalStore(db);
  return { node, handle: { db, store } };
}

describe("local-first chat data (mobile)", () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "pulse-"))));
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows may hold the sqlite file briefly */ }
  });

  function make(path: string, remoteOverrides: Partial<{ listMessages: jest.Mock; listConversations: jest.Mock; sendText: jest.Mock }> = {}) {
    const { node, handle } = openFile(path);
    const remote = {
      listConversations: remoteOverrides.listConversations ?? jest.fn(async () => ok({ items: [summary], hasMore: false })),
      listMessages: remoteOverrides.listMessages ?? jest.fn(async () =>
        ok({ items: [msg("m2", "second hello", "2026-01-01T00:00:02.000Z"), msg("m1", "first hello", "2026-01-01T00:00:01.000Z")], hasMore: false })),
    };
    const sendText = remoteOverrides.sendText ?? jest.fn(async () => err("network.offline"));
    const data = createLocalChatData({
      getDb: async () => { await handle.store.init(); return handle; },
      getUserId: async () => "u1",
      remote,
      sendText,
    });
    return { node, data, remote, sendText };
  }

  it("opens a warm chat with no network read", async () => {
    const a = make(join(dir, "db.sqlite"));
    await a.data.listChats({});
    const first = await a.data.listMessages("c1", null);
    expect(first && first.ok && first.value.items.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(a.remote.listMessages).toHaveBeenCalledTimes(1);
    a.data.reset();
    a.node.close();

    // App restart: new objects, same file, remote now unreachable.
    const offline = jest.fn(async () => { throw new Error("offline"); });
    const b = make(join(dir, "db.sqlite"), { listMessages: offline, listConversations: offline });
    const chats = await b.data.listChats({});
    const again = await b.data.listMessages("c1", null);
    expect(chats && chats.ok && chats.value.items).toHaveLength(1);
    expect(again && again.ok && again.value.items.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(offline).not.toHaveBeenCalled();
    b.data.reset();
    b.node.close();
  });

  it("keeps a pending send across a restart and delivers it afterwards", async () => {
    const path = join(dir, "db.sqlite");
    const a = make(path);
    await a.data.listMessages("c1", null);
    const sent = await a.data.sendText({ conversationId: "c1", clientId: "cid-1", body: "survives" });
    expect(sent && sent.ok && sent.value.status).toBe("pending");
    await new Promise((r) => setTimeout(r, 20));
    a.data.reset();
    a.node.close();

    const delivered = jest.fn(async () => ok(msg("srv-1", "survives", "2026-01-01T00:00:09.000Z")));
    const b = make(path, { sendText: delivered });
    const list = await b.data.listMessages("c1", null);
    expect(list && list.ok && list.value.items[0]).toMatchObject({ id: "cid-1", status: expect.stringMatching(/pending|failed/) });
    await b.data.resume();
    await new Promise((r) => setTimeout(r, 50));
    expect(delivered).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid-1", body: "survives" }));
    b.data.reset();
    b.node.close();
  });

  it("searches offline through FTS5", async () => {
    const a = make(join(dir, "db.sqlite"), { listMessages: undefined });
    await a.data.listMessages("c1", null);
    const hits = await a.data.search("sec");
    expect(hits?.map((h) => h.messageId)).toEqual(["m2"]);
    expect((await a.data.search("hello"))?.map((h) => h.messageId)).toEqual(["m2", "m1"]);
    expect(await a.data.search("   ")).toEqual([]);
    expect(await a.data.search('"; DROP')).toEqual([]);
    a.data.reset();
    a.node.close();
  });

  it("does nothing when the local db is unavailable (flag off)", async () => {
    const data = createLocalChatData({
      getDb: async () => null, getUserId: async () => "u1",
      remote: { listConversations: jest.fn(), listMessages: jest.fn() },
      sendText: jest.fn(),
    });
    expect(await data.listChats({})).toBeNull();
    expect(await data.listMessages("c1", null)).toBeNull();
    expect(await data.sendText({ conversationId: "c1", clientId: "x", body: "b" })).toBeNull();
    expect(await data.search("a")).toBeNull();
  });
});
