import { describe, expect, it } from "vitest";

import { mediaTimelineType, readStoredMediaRef, rowToRpcMessage } from "./mappers";
import type { MessageRow } from "./types";

const REF = { r2Key: "obj", key: "k", sha256: "h", mimeType: "image/png", size: 3, expired: false };

function row(over: Partial<MessageRow>): MessageRow {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: "2026-10-31T10:00:00.000Z",
    received_at: null,
    kind: "media",
    body: null,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: "sent",
    media_json: JSON.stringify(REF),
    ...over,
  };
}

describe("encrypted media rows", () => {
  it("reads the stored reference only from a media row with a complete reference", () => {
    expect(readStoredMediaRef(row({}))).toMatchObject(REF);
    expect(readStoredMediaRef(row({ kind: "text" }))).toBeNull();
    expect(readStoredMediaRef(row({ media_json: "{" }))).toBeNull();
    expect(readStoredMediaRef(row({ media_json: JSON.stringify({ r2Key: "x" }) }))).toBeNull();
  });

  it("picks the timeline type from the MIME type", () => {
    expect(mediaTimelineType("image/png")).toBe("image");
    expect(mediaTimelineType("audio/ogg")).toBe("audio");
    expect(mediaTimelineType("application/pdf")).toBe("file");
  });

  it("maps a media row to a typed message carrying the reference", () => {
    const msg = rowToRpcMessage(row({}));
    expect(msg.type).toBe("image");
    expect((msg.metadata as { e2eeMedia: { r2Key: string } }).e2eeMedia.r2Key).toBe("obj");
  });
});
