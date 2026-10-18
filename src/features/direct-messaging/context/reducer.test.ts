import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import type { ConversationDetail } from "../types";
import { createInitialState, messagingReducer } from "./reducer";

function msg(overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: "u1",
    client_id: "client-1",
    type: "text",
    body: "hello",
    reply_to_id: null,
    created_at: "2026-01-02T00:00:00.000Z",
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    ...overrides,
  };
}

describe("messagingReducer realtime", () => {
  it("upserts UPDATE edits and applies tombstone rules", () => {
    let state = createInitialState("u1");
    state = messagingReducer(state, {
      type: "messages/set",
      conversationId: "c1",
      items: [msg({ body: "before" })],
      hasMore: false,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({
        body: "after",
        edited_at: "2026-01-03T00:00:00.000Z",
      }),
    });
    expect(state.messagesByConversation.c1?.[0]?.body).toBe("after");

    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({
        body: "gone",
        deletion_scope: "everyone",
        metadata: { upload: "ready" },
      }),
    });
    expect(state.messagesByConversation.c1?.[0]?.body).toBeNull();
    expect(state.messagesByConversation.c1?.[0]?.metadata).toEqual({});
  });

  it("merges an out-of-order INSERT into the timeline", () => {
    let state = createInitialState("u1");
    state = messagingReducer(state, {
      type: "messages/set",
      conversationId: "c1",
      items: [msg({ id: "m-new", created_at: "2026-01-02T00:00:00.000Z" })],
      hasMore: false,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({
        id: "m-old",
        created_at: "2026-01-01T00:00:00.000Z",
        body: "older",
      }),
    });
    const ids = state.messagesByConversation.c1?.map((m) => m.id);
    expect(ids).toEqual(["m-new", "m-old"]);
  });

  it("does not add pending media for a non-sender", () => {
    let state = createInitialState("u-viewer");
    state = messagingReducer(state, {
      type: "messages/set",
      conversationId: "c1",
      items: [],
      hasMore: false,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({
        sender_id: "u-sender",
        type: "image",
        metadata: { upload: "pending" },
      }),
    });
    expect(state.messagesByConversation.c1).toHaveLength(0);
  });

  it("drops a visible message when a later update hides it from the viewer", () => {
    let state = createInitialState("u-viewer");
    state = messagingReducer(state, {
      type: "messages/set",
      conversationId: "c1",
      items: [
        msg({
          id: "m-upload",
          sender_id: "u-sender",
          type: "image",
          metadata: { upload: "ready" },
        }),
      ],
      hasMore: false,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({
        id: "m-upload",
        sender_id: "u-sender",
        type: "image",
        metadata: { upload: "failed" },
      }),
    });
    expect(state.messagesByConversation.c1).toHaveLength(0);
  });

  it("removes a message on hide for the current user", () => {
    let state = createInitialState("u1");
    state = messagingReducer(state, {
      type: "messages/set",
      conversationId: "c1",
      items: [msg(), msg({ id: "m2" })],
      hasMore: false,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/remove",
      conversationId: "c1",
      messageId: "m1",
    });
    expect(state.messagesByConversation.c1?.map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("messagingReducer pending dedupe", () => {
  const pending = {
    clientId: "c-1",
    conversationId: "conv-1",
    body: "hi",
    status: "pending" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("drops the optimistic item when the realtime echo of own message arrives", () => {
    let state = createInitialState("me");
    state = messagingReducer(state, { type: "pending/add", pending });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "conv-1",
      message: msg({ id: "m-1", sender_id: "me", client_id: "c-1" }),
    });
    expect(state.pendingSends).toHaveLength(0);
    expect(state.messagesByConversation["conv-1"]).toHaveLength(1);
  });

  it("keeps pending items when another user's message arrives", () => {
    let state = createInitialState("me");
    state = messagingReducer(state, { type: "pending/add", pending });
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "conv-1",
      message: msg({ id: "m-2", sender_id: "other", client_id: "c-9" }),
    });
    expect(state.pendingSends).toHaveLength(1);
    expect(state.messagesByConversation["conv-1"]).toHaveLength(1);
  });

  it("applies a message from another user to the open conversation", () => {
    const state = messagingReducer(createInitialState("me"), {
      type: "messages/upsert",
      conversationId: "conv-1",
      message: msg({ id: "m-3", sender_id: "other" }),
    });
    expect(state.messagesByConversation["conv-1"]?.[0]?.id).toBe("m-3");
  });
});

function detailFor(
  overrides: Partial<ConversationDetail> = {},
): ConversationDetail {
  return {
    id: "c1",
    type: "direct",
    title: null,
    last_message_at: null,
    last_message_id: null,
    last_read_message_id: null,
    last_read_at: null,
    pinned_at: null,
    archived_at: null,
    muted_until: null,
    other_user_id: "peer",
    other_username: "peer",
    other_display_name: null,
    other_avatar_url: null,
    other_last_read_message_id: null,
    other_last_read_created_at: null,
    other_send_read_receipts: true,
    other_last_delivered_at: null,
    role: "member",
    ...overrides,
  };
}

describe("messagingReducer monotonic receipts", () => {
  it("keeps delivered and read when a stale detail arrives", () => {
    let state = createInitialState("me");
    state = messagingReducer(state, {
      type: "detail/set",
      conversationId: "c1",
      detail: detailFor({
        other_last_delivered_at: "2026-01-02T00:00:05.000Z",
        other_last_read_message_id: "m2",
        other_last_read_created_at: "2026-01-02T00:00:04.000Z",
      }),
    });
    state = messagingReducer(state, {
      type: "detail/set",
      conversationId: "c1",
      detail: detailFor(),
    });
    const d = state.detailsByConversation["c1"]!;
    expect(d.other_last_delivered_at).toBe("2026-01-02T00:00:05.000Z");
    expect(d.other_last_read_message_id).toBe("m2");
  });

  it("clears the read cursor when the peer turns receipts off", () => {
    let state = createInitialState("me");
    state = messagingReducer(state, {
      type: "detail/set",
      conversationId: "c1",
      detail: detailFor({
        other_last_read_message_id: "m2",
        other_last_read_created_at: "2026-01-02T00:00:04.000Z",
      }),
    });
    state = messagingReducer(state, {
      type: "detail/set",
      conversationId: "c1",
      detail: detailFor({ other_send_read_receipts: false }),
    });
    expect(
      state.detailsByConversation["c1"]!.other_last_read_message_id,
    ).toBeNull();
  });

  it("patchOwnRead sets the own cursor and no-ops without a detail", () => {
    const empty = createInitialState("me");
    const patch = {
      type: "detail/patchOwnRead" as const,
      conversationId: "c1",
      lastReadMessageId: "m1",
      lastReadAt: "2026-01-02T00:00:00.000Z",
    };
    expect(messagingReducer(empty, patch)).toBe(empty);
    let state = messagingReducer(empty, {
      type: "detail/set",
      conversationId: "c1",
      detail: detailFor(),
    });
    state = messagingReducer(state, patch);
    expect(state.detailsByConversation["c1"]!.last_read_message_id).toBe("m1");
  });

  it("receipts/set keeps the higher rank for the same message and restarts for a new one", () => {
    let state = createInitialState("me");
    state = messagingReducer(state, {
      type: "receipts/set",
      receipts: { c1: { status: "read", messageId: "m1" } },
    });
    state = messagingReducer(state, {
      type: "receipts/set",
      receipts: { c1: { status: "sent", messageId: "m1" } },
    });
    expect(state.receiptsByConversation["c1"]).toEqual({
      status: "read",
      messageId: "m1",
    });
    state = messagingReducer(state, {
      type: "receipts/set",
      receipts: { c1: { status: "sent", messageId: "m2" } },
    });
    expect(state.receiptsByConversation["c1"]).toEqual({
      status: "sent",
      messageId: "m2",
    });
  });

  it("returns the same state for no-op actions", () => {
    const state = createInitialState("me");
    expect(
      messagingReducer(state, {
        type: "connection",
        status: state.connectionStatus,
      }),
    ).toBe(state);
    expect(
      messagingReducer(state, { type: "pending/remove", clientId: "nope" }),
    ).toBe(state);
  });
});

describe("messagingReducer archived chats", () => {
  const summary = (id: string, archived: boolean) =>
    ({ id, archived_at: archived ? "2026-01-01T00:00:00.000Z" : null }) as never;

  it("does not add an archived chat to a list that is not the archived view", () => {
    const state = createInitialState("me");
    const next = messagingReducer(state, {
      type: "conversations/patch",
      item: summary("c1", true),
    });
    expect(next.conversations).toEqual([]);
  });

  it("admits only archived chats into the archived view", () => {
    const state = createInitialState("me");
    const live = messagingReducer(state, {
      type: "conversations/patch",
      item: summary("c1", false),
      archivedOnly: true,
    });
    expect(live.conversations).toEqual([]);
    const archived = messagingReducer(state, {
      type: "conversations/patch",
      item: summary("c2", true),
      archivedOnly: true,
    });
    expect(archived.conversations).toHaveLength(1);
  });

  it("stores the archived summary and keeps state identity when unchanged", () => {
    const state = messagingReducer(createInitialState("me"), {
      type: "archived/set",
      summary: { count: 2, unread: 3 },
    });
    expect(state.archivedSummary).toEqual({ count: 2, unread: 3 });
    expect(
      messagingReducer(state, { type: "archived/set", summary: { count: 2, unread: 3 } }),
    ).toBe(state);
  });
});

describe("messagingReducer live flag", () => {
  const base = () => createInitialState("u1");

  it("marks realtime inserts and optimistic sends live, not loaded history", () => {
    let state = messagingReducer(base(), {
      type: "messages/set",
      conversationId: "c1",
      items: [msg({ id: "old", client_id: "old-c" })],
      hasMore: true,
      cursor: null,
    });
    state = messagingReducer(state, {
      type: "messages/mergePage",
      conversationId: "c1",
      items: [msg({ id: "older", client_id: "older-c" })],
      hasMore: false,
      cursor: null,
    });
    expect(state.liveClientIds).toEqual({});

    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({ id: "new", client_id: "new-c", sender_id: "u2" }),
    });
    expect(state.liveClientIds).toEqual({ "new-c": true });

    state = messagingReducer(state, {
      type: "pending/add",
      pending: {
        clientId: "p-c",
        conversationId: "c1",
        body: "x",
        createdAt: "2026-01-03T00:00:00.000Z",
        status: "pending",
      },
    });
    expect(state.liveClientIds["p-c"]).toBe(true);

    state = messagingReducer(state, { type: "live/clear", clientId: "new-c" });
    expect(state.liveClientIds["new-c"]).toBeUndefined();
    // An edit of an existing message is not live.
    state = messagingReducer(state, {
      type: "messages/upsert",
      conversationId: "c1",
      message: msg({ id: "new", client_id: "new-c", sender_id: "u2", body: "e" }),
    });
    expect(state.liveClientIds["new-c"]).toBeUndefined();
  });
});
