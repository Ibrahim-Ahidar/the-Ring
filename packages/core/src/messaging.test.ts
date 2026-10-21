import { afterEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "./rpc";

import { decodeMessageCursor } from "./pagination";
import {
  getConversation,
  listConversations,
  listMessages,
  markRead,
  messagePageNextCursor,
  sendText,
} from "./messaging";

function rpcReturning(result: { data: unknown; error: { message: string; code?: string } | null }): RpcClient {
  return { rpc: async () => result };
}

describe("listMessages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("surfaces a feature error code instead of an empty list", async () => {
    const result = await listMessages(
      rpcReturning({ data: null, error: { message: "messaging.not_member" } }),
      { conversationId: "c1" },
    );
    expect(result).toEqual({ ok: false, error: { code: "messaging.not_member" } });
  });

  it("logs the underlying cause of an unexpected database error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await listMessages(
      rpcReturning({ data: null, error: { message: 'column reference "id" is ambiguous', code: "42702" } }),
      { conversationId: "c1" },
    );
    expect(result).toEqual({ ok: false, error: { code: "platform.unexpected" } });
    expect(spy).toHaveBeenCalledWith(
      "[rpc] list_messages failed",
      expect.objectContaining({ pgCode: "42702" }),
    );
  });

  it("returns rows and has_more from the first row", async () => {
    const rows = [{ id: "m1", has_more: true }, { id: "m0", has_more: true }];
    const result = await listMessages(rpcReturning({ data: rows, error: null }), {
      conversationId: "c1",
    });
    expect(result).toEqual({ ok: true, value: { items: rows, hasMore: true } });
  });
});

function recording(data: unknown) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return { data, error: null };
    },
  };
  return { client, calls };
}

const row = {
  id: "m1",
  conversation_id: "c1",
  sender_id: "u1",
  client_id: "k1",
  type: "text" as const,
  body: "hi",
  reply_to_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  deletion_scope: "none" as const,
  pinned_at: null,
  forwarded: false,
  metadata: null,
};

describe("sendText", () => {
  it("calls send_text with p_ args and maps the first row", async () => {
    const { client, calls } = recording([row]);
    const result = await sendText(client, { conversationId: "c1", clientId: "k1", body: "hi" });
    expect(calls).toEqual([
      {
        fn: "send_text",
        args: { p_conversation_id: "c1", p_client_id: "k1", p_body: "hi", p_reply_to_id: null },
      },
    ]);
    expect(result).toEqual({ ok: true, value: row });
  });

  it("fails when the RPC returns no row", async () => {
    const { client } = recording([]);
    const result = await sendText(client, { conversationId: "c1", clientId: "k1", body: "hi" });
    expect(result).toEqual({ ok: false, error: { code: "platform.unexpected" } });
  });
});

describe("markRead / getConversation / listConversations", () => {
  it("markRead returns the cursor row", async () => {
    const { client, calls } = recording([{ last_read_message_id: "m1", last_read_at: "t" }]);
    const result = await markRead(client, { conversationId: "c1", messageId: "m1" });
    expect(calls[0]).toEqual({ fn: "mark_read", args: { p_conversation_id: "c1", p_message_id: "m1" } });
    expect(result).toEqual({ ok: true, value: { last_read_message_id: "m1", last_read_at: "t" } });
  });

  it("getConversation unwraps the single row", async () => {
    const { client } = recording([{ id: "c1" }]);
    expect(await getConversation(client, { conversationId: "c1" })).toEqual({
      ok: true,
      value: { id: "c1" },
    });
  });

  it("listConversations passes filters and reads has_more", async () => {
    const { client, calls } = recording([{ id: "c1", has_more: true }]);
    const result = await listConversations(client, { unreadOnly: true });
    expect(calls[0]?.args).toMatchObject({ p_unread_only: true, p_cursor: null });
    expect(result).toMatchObject({ ok: true, value: { hasMore: true } });
  });
});

describe("messagePageNextCursor", () => {
  it("encodes the oldest row of a newest-first page and is null when empty", () => {
    expect(messagePageNextCursor([])).toBeNull();
    const cursor = messagePageNextCursor([row, { ...row, id: "m0", created_at: "2025-12-31T00:00:00.000Z" }]);
    expect(decodeMessageCursor(cursor!)).toEqual({ createdAt: "2025-12-31T00:00:00.000Z", id: "m0" });
  });
});
