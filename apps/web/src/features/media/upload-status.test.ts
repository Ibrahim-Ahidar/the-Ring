import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import { shouldHideMessageForViewer, uploadPhase } from "./upload-status";

function baseMessage(overrides: Partial<TimelineMessage>): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: "u1",
    client_id: "cl1",
    type: "image",
    body: null,
    reply_to_id: null,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    ...overrides,
  };
}

describe("uploadPhase", () => {
  it("reads metadata upload state", () => {
    expect(uploadPhase(baseMessage({ metadata: { upload: "pending" } }))).toBe(
      "pending",
    );
  });
});

describe("shouldHideMessageForViewer", () => {
  it("hides pending uploads from non-senders", () => {
    const msg = baseMessage({ metadata: { upload: "pending" }, sender_id: "u1" });
    expect(shouldHideMessageForViewer(msg, "u2")).toBe(true);
    expect(shouldHideMessageForViewer(msg, "u1")).toBe(false);
  });
});

describe("text messages are never hidden", () => {
  it.each([null, {}, { upload: "ready" }, { other: 1 }])(
    "shows a text message with metadata %j to another viewer",
    (metadata) => {
      const msg = {
        id: "m",
        conversation_id: "c",
        sender_id: "u1",
        client_id: "x",
        type: "text",
        body: "hi",
        reply_to_id: null,
        created_at: "2026-01-01T00:00:00Z",
        edited_at: null,
        deleted_at: null,
        deletion_scope: "none",
        pinned_at: null,
        forwarded: false,
        metadata,
      } as Parameters<typeof shouldHideMessageForViewer>[0];
      expect(shouldHideMessageForViewer(msg, "u2")).toBe(false);
    },
  );
});
