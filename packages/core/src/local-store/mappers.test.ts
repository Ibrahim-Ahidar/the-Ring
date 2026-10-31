import { describe, expect, it } from "vitest";

import { mediaTimelineType, readStoredMediaRef, rowToRpcMessage, rpcMessageToRow } from "./mappers";
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
  it("keeps the reference through a round trip, including a persisted expired flag", () => {
    const original = row({});
    const msg = rowToRpcMessage(original);
    const back = rpcMessageToRow(msg, "2026-10-31T10:01:00.000Z");
    expect(back.kind).toBe("media");
    expect(rowToRpcMessage(back)).toEqual(msg);

    const expired = row({ media_json: JSON.stringify({ ...REF, expired: true }) });
    const again = rpcMessageToRow(rowToRpcMessage(expired), "2026-10-31T10:01:00.000Z");
    expect(readStoredMediaRef(again)?.expired).toBe(true);
  });

  it("maps tombstones of text and media rows to deleted messages with a timeline type", () => {
    const text = rowToRpcMessage(row({ kind: "text", deleted: 1, body: null, media_json: null }));
    const media = rowToRpcMessage(row({ kind: "media", deleted: 1, body: null, media_json: null, edited_at: "2026-10-31T11:00:00.000Z" }));
    for (const m of [text, media]) {
      expect(m.deleted_at).toBeTruthy();
      expect(m.deletion_scope).toBe("everyone");
      expect(m.body).toBeNull();
      expect(m.type).toBe("text");
      expect((m.metadata as { e2eeMedia?: unknown } | null)?.e2eeMedia).toBeUndefined();
    }
    expect(text.deleted_at).toBe("2026-10-31T10:00:00.000Z");
    expect(media.deleted_at).toBe("2026-10-31T11:00:00.000Z");
  });
});
