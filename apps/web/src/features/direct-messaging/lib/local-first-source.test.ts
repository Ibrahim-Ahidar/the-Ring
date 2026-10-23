import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqlLocalStore, type LocalStore } from "@pulse/core/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import { ok } from "@pulse/core/result";

import { messagePageNextCursor } from "../service";
import type { ConversationSummary, RpcMessageRow } from "../types";
import { createLocalFirstSource, type RemoteSource } from "./local-first-source";

function rpc(id: string, at: string, body = "hi"): RpcMessageRow {
  return {
    id,
    conversation_id: "c1",
    sender_id: "u1",
    client_id: id,
    type: "text",
    body,
    reply_to_id: null,
    created_at: at,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
  };
}

const summary: ConversationSummary = {
  id: "c1",
  type: "direct",
  title: null,
  last_message_at: "2026-01-01T00:00:03Z",
  last_message_id: "m3",
  last_message_preview: "hi",
  last_message_deletion_scope: "none",
  unread_count: 2,
  pinned_at: null,
  archived_at: null,
  muted_until: null,
  other_user_id: "u2",
  other_username: "bob",
  other_display_name: "Bob",
  other_avatar_url: null,
};

describe("local-first source", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  let remote: { [K in keyof RemoteSource]: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
    // newest first, as list_messages returns them
    const all = [
      rpc("m3", "2026-01-01T00:00:03Z"),
      rpc("m2", "2026-01-01T00:00:02Z"),
      rpc("m1", "2026-01-01T00:00:01Z"),
    ];
    remote = {
      listConversations: vi.fn(async () => ok({ items: [summary], hasMore: false })),
      listMessages: vi.fn(async (input: { cursor?: string | null }) =>
        input.cursor
          ? ok({ items: all.slice(2), hasMore: false })
          : ok({ items: all.slice(0, 2), hasMore: true }),
      ),
    };
  });
  afterEach(() => exec.close());

  it("makes zero RPC calls for the chat view when the local DB is warm", async () => {
    const source = createLocalFirstSource(store, remote as unknown as RemoteSource);
    await source.syncMessages("c1");
    await source.syncConversations();
    remote.listMessages.mockClear();
    remote.listConversations.mockClear();

    const page = await source.listMessages({ conversationId: "c1" });
    const list = await source.listConversations({});

    expect(remote.listMessages).not.toHaveBeenCalled();
    expect(remote.listConversations).not.toHaveBeenCalled();
    expect(page.ok && page.value.items.map((m) => m.id)).toEqual(["m3", "m2"]);
    expect(page.ok && page.value.hasMore).toBe(true);
    expect(list.ok && list.value.items[0]).toEqual(summary);
  });

  it("fetches a cold chat once and serves it locally afterwards", async () => {
    const source = createLocalFirstSource(store, remote as unknown as RemoteSource);
    await source.listMessages({ conversationId: "c1" });
    await source.listMessages({ conversationId: "c1" });
    expect(remote.listMessages).toHaveBeenCalledTimes(1);
  });

  it("fetches older history once, then serves it locally", async () => {
    const source = createLocalFirstSource(store, remote as unknown as RemoteSource);
    const first = await source.listMessages({ conversationId: "c1" });
    const items = first.ok ? first.value.items : [];
    const cursor = messagePageNextCursor(items);
    const older = await source.listMessages({ conversationId: "c1", cursor });
    expect(older.ok && older.value.items.map((m) => m.id)).toEqual(["m1"]);
    expect(older.ok && older.value.hasMore).toBe(false);
    remote.listMessages.mockClear();
    await source.listMessages({ conversationId: "c1", cursor });
    expect(remote.listMessages).not.toHaveBeenCalled();
  });

  it("passes filtered list views through to the network", async () => {
    const source = createLocalFirstSource(store, remote as unknown as RemoteSource);
    await source.listConversations({ archivedOnly: true });
    expect(remote.listConversations).toHaveBeenCalledWith({ archivedOnly: true });
  });

  it("stores realtime messages so they show up in the next local read", async () => {
    const source = createLocalFirstSource(store, remote as unknown as RemoteSource);
    await source.syncMessages("c1");
    await source.applyRealtimeMessage({
      id: "m4",
      conversation_id: "c1",
      sender_id: "u2",
      type: "text",
      body: "new",
      created_at: "2026-01-01T00:00:04Z",
    });
    remote.listMessages.mockClear();
    const page = await source.listMessages({ conversationId: "c1" });
    expect(remote.listMessages).not.toHaveBeenCalled();
    expect(page.ok && page.value.items[0]?.id).toBe("m4");
  });
});
