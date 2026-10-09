import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

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
