import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import {
  applyListMessagesTombstone,
  mergeRealtimeMessage,
  shouldApplyRealtimeMessage,
} from "./realtime-message";

function base(overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: "u1",
    client_id: "client-1",
    type: "text",
    body: "hello",
    reply_to_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    ...overrides,
  };
}

describe("applyListMessagesTombstone", () => {
  it("clears body, metadata, and attachments for delete-for-everyone", () => {
    const tombstoned = applyListMessagesTombstone(
      base({
        deletion_scope: "everyone",
        body: "secret",
        metadata: { upload: "ready" },
        attachments: [
          {
            id: "a1",
            message_id: "m1",
            storage_path: "p",
            mime_type: "image/png",
            size_bytes: 1,
            file_name: null,
            width: null,
            height: null,
            duration_ms: null,
            waveform: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(tombstoned.body).toBeNull();
    expect(tombstoned.metadata).toEqual({});
    expect(tombstoned.attachments).toEqual([]);
  });
});

describe("mergeRealtimeMessage", () => {
  it("preserves attachments and reactions when the payload omits them", () => {
    const existing = base({
      attachments: [
        {
          id: "a1",
          message_id: "m1",
          storage_path: "p",
          mime_type: "image/png",
          size_bytes: 1,
          file_name: null,
          width: null,
          height: null,
          duration_ms: null,
          waveform: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      reactions: [
        {
          message_id: "m1",
          user_id: "u2",
          emoji: "👍",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const merged = mergeRealtimeMessage(
      existing,
      base({ body: "edited", edited_at: "2026-01-02T00:00:00.000Z" }),
    );
    expect(merged.body).toBe("edited");
    expect(merged.attachments).toHaveLength(1);
    expect(merged.reactions).toHaveLength(1);
  });

  it("inserts out-of-order rows by created_at via reducer merge sort", () => {
    const older = base({
      id: "m-old",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const newer = base({
      id: "m-new",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    expect(mergeRealtimeMessage(undefined, older).id).toBe("m-old");
    expect(mergeRealtimeMessage(undefined, newer).id).toBe("m-new");
  });
});

describe("shouldApplyRealtimeMessage", () => {
  it("hides pending uploads for non-senders", () => {
    expect(
      shouldApplyRealtimeMessage(
        base({
          sender_id: "u2",
          type: "image",
          metadata: { upload: "pending" },
        }),
        "u1",
      ),
    ).toBe(false);
  });

  it("shows pending uploads to the sender", () => {
    expect(
      shouldApplyRealtimeMessage(
        base({
          sender_id: "u1",
          type: "image",
          metadata: { upload: "pending" },
        }),
        "u1",
      ),
    ).toBe(true);
  });
});
