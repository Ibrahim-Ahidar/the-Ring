import { describe, expect, it, vi } from "vitest";

import type { MediaBody } from "@pulse/core/e2ee/plain-envelope";
import { createSqlLocalStore } from "@pulse/core/local-store/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import { ok } from "@pulse/core/result";

import { buildEnvelope } from "./mailbox-send";
import { createTextOutbox, type TextPayload } from "./text-outbox";

const MEDIA = {
  r2Key: "obj-1",
  key: "a2V5",
  sha256: "abc",
  mimeType: "image/png",
  size: 12,
  fileName: "pic.png",
  width: 10,
  height: 20,
  durationMs: null,
  thumbnail: null,
  caption: null,
} as unknown as MediaBody;

const AT = "2026-10-31T10:00:00.000Z";

describe("media envelope", () => {
  it("builds a media envelope for a payload with media and a text envelope otherwise", () => {
    const base = { conversationId: "c1", clientId: "m1", body: "" };
    expect(buildEnvelope({ ...base, media: MEDIA }, AT)).toMatchObject({ kind: "media", body: MEDIA });
    expect(buildEnvelope({ ...base, body: "hi" }, AT)).toMatchObject({ kind: "text" });
  });
});

describe("text outbox with a media payload", () => {
  it("stores a media row, sends the payload with the reference and reports an image message", async () => {
    const db = createNodeSqliteExecutor();
    const store = createSqlLocalStore(db);
    await store.init();
    const sendText = vi.fn(async (input: TextPayload) =>
      ok({
        id: "srv-1",
        conversation_id: input.conversationId,
        sender_id: "u1",
        client_id: input.clientId,
        type: "text",
        body: null,
        reply_to_id: null,
        created_at: AT,
        edited_at: null,
        deleted_at: null,
        deletion_scope: "none",
        pinned_at: null,
        forwarded: false,
        metadata: {},
      } as never),
    );
    const sent: unknown[] = [];
    const box = createTextOutbox({
      db,
      store,
      sendText,
      events: () => ({ onSent: (_id, m) => void sent.push(m), onFailed: () => undefined }),
      userId: "u1",
    });

    await box.enqueueText({ conversationId: "c1", clientId: "m1", body: "", media: MEDIA }, AT);
    const pending = await store.getMessage("m1");
    expect(pending?.kind).toBe("media");
    expect(JSON.parse(pending!.media_json as string)).toMatchObject({ r2Key: "obj-1", expired: false });

    await box.drain({ force: true });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0]![0].media).toEqual(MEDIA);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "image", metadata: { e2eeMedia: { r2Key: "obj-1", expired: false } } });
  });
  it("leaves a queued media row out of listPending and still resends it after a restart", async () => {
    const db = createNodeSqliteExecutor();
    const store = createSqlLocalStore(db);
    await store.init();
    const sendText = vi.fn(async (input: TextPayload) =>
      ok({ id: "srv-2", conversation_id: input.conversationId, sender_id: "u1", client_id: input.clientId, type: "text", body: null, reply_to_id: null, created_at: AT, edited_at: null, deleted_at: null, deletion_scope: "none", pinned_at: null, forwarded: false, metadata: {} } as never),
    );
    const make = () =>
      createTextOutbox({ db, store, sendText, events: () => ({ onSent: () => undefined, onFailed: () => undefined }), userId: "u1" });
    const first = make();
    await first.enqueueText({ conversationId: "c1", clientId: "m2", body: "", media: MEDIA }, AT);
    await first.enqueueText({ conversationId: "c1", clientId: "t1", body: "hi" }, AT);
    const second = make();
    const pending = await second.listPending();
    expect(pending.map((p) => p.clientId)).toEqual(["t1"]);
    await second.drain({ force: true });
    const sentMedia = sendText.mock.calls.map((c) => c[0]).find((p) => p.clientId === "m2");
    expect(sentMedia?.media).toEqual(MEDIA);
  });
});
