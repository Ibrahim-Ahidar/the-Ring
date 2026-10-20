import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@pulse/core/timeline";

import { canDeleteForEveryone, canEdit } from "./permissions";

function message(overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: "u1",
    client_id: "client",
    type: "text",
    body: "hello",
    reply_to_id: null,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: {},
    ...overrides,
  };
}

describe("permissions", () => {
  it("allows edit for sender inside 15 minutes", () => {
    expect(canEdit(message(), "u1").allowed).toBe(true);
  });

  it("rejects edit after 15 minutes", () => {
    const old = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    expect(canEdit(message({ created_at: old }), "u1").allowed).toBe(false);
  });

  it("allows group admin delete for others", () => {
    expect(
      canDeleteForEveryone(message({ sender_id: "u2" }), "u1", "group", "admin")
        .allowed,
    ).toBe(true);
  });
});
