import { describe, expect, it } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import {
  mergeDetailMonotonic,
  outboundDeliveryStatus,
  rankDelivery,
} from "./delivery";
import type { ConversationDetail } from "./types";

function message(id: string, createdAt: string): TimelineMessage {
  return {
    id,
    conversation_id: "c1",
    sender_id: "me",
    client_id: id,
    type: "text",
    body: "hi",
    reply_to_id: null,
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
  };
}

function detail(overrides: Partial<ConversationDetail>): ConversationDetail {
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

const first = message("m1", "2026-10-14T10:00:00.000000+00:00");
const second = message("m2", "2026-10-14T10:05:00.000000+00:00");

describe("outboundDeliveryStatus", () => {
  it("keeps local pending and failed states", () => {
    expect(outboundDeliveryStatus(first, detail({}), "pending")).toBe("pending");
    expect(outboundDeliveryStatus(first, detail({}), "failed")).toBe("failed");
  });

  it("is sent until the peer acknowledges delivery", () => {
    expect(outboundDeliveryStatus(first, detail({}))).toBe("sent");
    expect(outboundDeliveryStatus(first, undefined)).toBe("sent");
  });

  it("is delivered up to the peer's delivered cursor", () => {
    // Different fractional-second formats must still compare by time.
    const d = detail({ other_last_delivered_at: "2026-10-14T10:00:00Z" });
    expect(outboundDeliveryStatus(first, d)).toBe("delivered");
    expect(outboundDeliveryStatus(second, d)).toBe("sent");
  });

  it("is read up to the peer's read cursor", () => {
    const d = detail({
      other_last_read_message_id: "m1",
      other_last_read_created_at: first.created_at,
      other_last_delivered_at: second.created_at,
    });
    expect(outboundDeliveryStatus(first, d)).toBe("read");
    expect(outboundDeliveryStatus(second, d)).toBe("delivered");
  });

  it("never shows read when the peer hides read receipts", () => {
    const d = detail({
      other_send_read_receipts: false,
      other_last_delivered_at: first.created_at,
    });
    expect(outboundDeliveryStatus(first, d)).toBe("delivered");
  });
});

describe("rankDelivery", () => {
  it("orders pending < sent < delivered < read", () => {
    expect(rankDelivery("pending")).toBeLessThan(rankDelivery("sent"));
    expect(rankDelivery("sent")).toBeLessThan(rankDelivery("delivered"));
    expect(rankDelivery("delivered")).toBeLessThan(rankDelivery("read"));
  });
});

describe("mergeDetailMonotonic", () => {
  it("returns next when there is no previous detail", () => {
    const next = detail({});
    expect(mergeDetailMonotonic(undefined, next)).toBe(next);
  });

  it("never moves the delivered cursor back", () => {
    const prev = detail({ other_last_delivered_at: "2026-10-14T10:05:00Z" });
    const stale = detail({ other_last_delivered_at: "2026-10-14T10:00:00Z" });
    expect(mergeDetailMonotonic(prev, stale).other_last_delivered_at).toBe(
      "2026-10-14T10:05:00Z",
    );
    expect(mergeDetailMonotonic(prev, detail({})).other_last_delivered_at).toBe(
      "2026-10-14T10:05:00Z",
    );
  });

  it("never moves the peer read cursor back", () => {
    const prev = detail({
      other_last_read_message_id: "m2",
      other_last_read_created_at: second.created_at,
    });
    const stale = detail({
      other_last_read_message_id: "m1",
      other_last_read_created_at: first.created_at,
    });
    expect(mergeDetailMonotonic(prev, stale).other_last_read_message_id).toBe(
      "m2",
    );
    expect(
      mergeDetailMonotonic(prev, detail({})).other_last_read_message_id,
    ).toBe("m2");
  });

  it("clears the read cursor when the peer turns receipts off", () => {
    const prev = detail({
      other_last_read_message_id: "m2",
      other_last_read_created_at: second.created_at,
    });
    const merged = mergeDetailMonotonic(
      prev,
      detail({ other_send_read_receipts: false }),
    );
    expect(merged.other_last_read_message_id).toBeNull();
  });

  it("keeps the later own read cursor", () => {
    const prev = detail({
      last_read_message_id: "m2",
      last_read_at: "2026-10-14T10:06:00Z",
    });
    expect(mergeDetailMonotonic(prev, detail({})).last_read_message_id).toBe(
      "m2",
    );
  });
});
