import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqlLocalStore, type LocalStore, type MessageRow } from "@pulse/core/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";

import { createMessageSearch, SEARCH_PAGE_SIZE } from "./message-search";

function row(id: string, body: string, conv = "c1"): MessageRow {
  return {
    id,
    conversation_id: conv,
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: "2026-01-01T00:00:00Z",
    received_at: null,
    kind: "text",
    body,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
  };
}

describe("message search routing", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  const remote = vi.fn(async () => ({ results: [], nextOffset: null }));

  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
    remote.mockClear();
  });
  afterEach(() => exec.close());

  const search = (e2ee: boolean, s: LocalStore | null = store) =>
    createMessageSearch({ isE2ee: () => e2ee, getStore: async () => s, remote });

  it("flag on: answers from the local store and makes no server search call", async () => {
    await store.upsertMessages([row("m1", "dinner at the harbour"), row("m2", "unrelated")]);
    const page = await search(true)({ query: "harbo" });
    expect(page.results.map((r) => r.messageId)).toEqual(["m1"]);
    expect(page.results[0]?.snippet.some((p) => p.match)).toBe(true);
    expect(remote).not.toHaveBeenCalled();
  });

  it("flag on: sees messages stored after the first search", async () => {
    const s = search(true);
    expect((await s({ query: "harbour" })).results).toEqual([]);
    await store.upsertMessages([row("m1", "harbour lights")]);
    expect((await s({ query: "harbour" })).results.map((r) => r.messageId)).toEqual(["m1"]);
  });

  it("flag on: scopes to a conversation and pages", async () => {
    const rows = Array.from({ length: SEARCH_PAGE_SIZE + 1 }, (_, i) => row(`m${i}`, "apple"));
    await store.upsertMessages([...rows, row("other", "apple", "c2")]);
    const first = await search(true)({ query: "apple", conversationId: "c1" });
    expect(first.results).toHaveLength(SEARCH_PAGE_SIZE);
    expect(first.nextOffset).toBe(SEARCH_PAGE_SIZE);
    const second = await search(true)({ query: "apple", conversationId: "c1", offset: first.nextOffset! });
    expect(second.results).toHaveLength(1);
    expect(second.nextOffset).toBeNull();
  });

  it("flag on without a local DB: empty, still no server call", async () => {
    const page = await search(true, null)({ query: "anything" });
    expect(page.results).toEqual([]);
    expect(remote).not.toHaveBeenCalled();
  });

  it("flag off: uses the server search, unchanged", async () => {
    await search(false)({ query: "  harbour " });
    expect(remote).toHaveBeenCalledWith({ query: "harbour" });
  });

  it("queries under two characters run nothing", async () => {
    await search(true)({ query: "a" });
    await search(false)({ query: "a" });
    expect(remote).not.toHaveBeenCalled();
  });
});
