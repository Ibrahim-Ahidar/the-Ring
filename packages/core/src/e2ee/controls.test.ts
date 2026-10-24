import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore, type MessageRow } from "../local-store";
import { createNodeSqliteExecutor } from "../local-store/node-sqlite-executor";
import {
  applyControl,
  countLocalUnread,
  deriveTick,
  markConversationRead,
  pinKey,
  replayQueuedControls,
} from "./controls";
import {
  decodePlainEnvelope,
  encodePlainEnvelope,
  type ControlEnvelope,
  type PlainEnvelope,
} from "./plain-envelope";
import { createEncryptedEnvelopeHandler } from "./receive";

const ME = "me";
const PEER = "peer";
const C = "conv";

function text(id: string, sentAt: string, sender = PEER): MessageRow {
  return {
    id,
    conversation_id: C,
    sender_user_id: sender,
    sender_device_id: "d",
    sent_at: sentAt,
    received_at: sentAt,
    kind: "text",
    body: `body-${id}`,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: "sent",
    media_json: null,
  };
}

function ctl(kind: string, body: unknown, sentAt: string, id = `c-${kind}-${sentAt}`) {
  return { v: 1, id, conversationId: C, sentAt, kind, body } as ControlEnvelope;
}

describe("plain envelope controls", () => {
  const parse = (o: unknown) => decodePlainEnvelope(JSON.stringify(o));
  it("round-trips every control kind through padding", () => {
    const at = "2026-01-01T00:00:00Z";
    const list: ControlEnvelope[] = [
      ctl("reaction", { messageId: "m", emoji: "+1", remove: false }, at),
      ctl("edit", { messageId: "m", body: "x" }, at),
      ctl("delete", { messageId: "m" }, at),
      ctl("receipt", { messageIds: ["m"] }, at),
      ctl("read", { messageIds: ["m"] }, at),
      ctl("audio_play", { messageId: "m" }, at),
      ctl("pin", { messageId: "m", pinned: true }, at),
    ];
    for (const c of list) expect(decodePlainEnvelope(encodePlainEnvelope(c))).toMatchObject(c);
  });
  it("rejects malformed controls", () => {
    const base = { v: 1, id: "i", conversationId: C, sentAt: "2026-01-01T00:00:00Z" };
    expect(parse({ ...base, kind: "reaction", body: { messageId: "m" } })).toBeNull();
    expect(
      parse({ ...base, kind: "reaction", body: { messageId: "m", emoji: "x".repeat(40) } }),
    ).toBeNull();
    expect(parse({ ...base, kind: "receipt", body: { messageIds: [] } })).toBeNull();
    expect(parse({ ...base, kind: "receipt", body: { messageIds: [1] } })).toBeNull();
    expect(parse({ ...base, kind: "edit", body: null })).toBeNull();
    expect(parse({ ...base, kind: "bogus", body: {} })).toBeNull();
    expect(parse({ ...base, v: 2, kind: "delete", body: { messageId: "m" } })).toBeNull();
    expect(parse({ ...base, sentAt: "nope", kind: "delete", body: { messageId: "m" } })).toBeNull();
    expect(parse({ ...base, id: "", kind: "delete", body: { messageId: "m" } })).toBeNull();
  });
});

describe("applyControl", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
  });
  afterEach(() => exec.close());
  const peer = { selfUserId: ME, senderUserId: PEER };
  const self = { selfUserId: ME, senderUserId: ME };
  const as = (senderUserId: string | null) => ({ selfUserId: ME, senderUserId });

  it("ticks only move forward: check, double, blue, and never back", async () => {
    await store.upsertMessages([text("m1", "2026-01-01T00:00:00Z", ME)]);
    const tick = async (status: string | null) =>
      deriveTick(status, await store.listReceipts(["m1"]), ME);
    expect(await tick("pending")).toBe("clock");
    expect(await tick("sent")).toBe("check");
    await applyControl(store, ctl("receipt", { messageIds: ["m1"] }, "2026-01-01T00:00:05Z"), peer);
    expect(await tick("sent")).toBe("double");
    await applyControl(store, ctl("read", { messageIds: ["m1"] }, "2026-01-01T00:00:09Z"), peer);
    expect(await tick("sent")).toBe("blue");
    // a late (re-ordered) delivery receipt must not clear the blue tick
    await applyControl(store, ctl("receipt", { messageIds: ["m1"] }, "2026-01-01T00:00:12Z"), peer);
    expect(await tick(null)).toBe("blue");
    const [r] = await store.listReceipts(["m1"]);
    expect(r.read_at).toBe("2026-01-01T00:00:09Z");
    expect(r.delivered_at).toBe("2026-01-01T00:00:05Z");
  });

  it("reaction add, replace and remove are last-writer-wins", async () => {
    await store.upsertMessages([text("m1", "2026-01-01T00:00:00Z")]);
    const r = (emoji: string, at: string, remove = false) =>
      applyControl(store, ctl("reaction", { messageId: "m1", emoji, remove }, at), peer);
    await r("a", "2026-01-01T00:00:02Z");
    await r("b", "2026-01-01T00:00:03Z");
    await r("a", "2026-01-01T00:00:01Z"); // stale, ignored
    expect((await store.listReactions(["m1"])).map((x) => x.emoji)).toEqual(["b"]);
    await r("b", "2026-01-01T00:00:04Z", true);
    expect(await store.listReactions(["m1"])).toEqual([]);
  });

  it("edit and delete apply for the author only and never create bubbles", async () => {
    await store.upsertMessages([text("m1", "2026-01-01T00:00:00Z")]);
    const edit = (b: string, at: string, sender = PEER) =>
      applyControl(store, ctl("edit", { messageId: "m1", body: b }, at), as(sender));
    expect(await edit("hijack", "2026-01-01T00:00:01Z", "mallory")).toBe("dropped");
    expect((await store.getMessage("m1"))?.body).toBe("body-m1");
    expect(await edit("v2", "2026-01-01T00:00:02Z")).toBe("applied");
    expect(await edit("v1", "2026-01-01T00:00:01Z")).toBe("dropped");
    expect((await store.getMessage("m1"))?.body).toBe("v2");
    const del = (at: string, sender: string) =>
      applyControl(store, ctl("delete", { messageId: "m1" }, at), as(sender));
    expect(await del("2026-01-01T00:00:03Z", "mallory")).toBe("dropped");
    expect(await del("2026-01-01T00:00:04Z", PEER)).toBe("applied");
    const row = await store.getMessage("m1");
    expect(row?.deleted).toBe(1);
    expect(row?.body).toBeNull();
    expect(await edit("late", "2026-01-01T00:00:09Z")).toBe("dropped");
    expect(await store.countMessages(C)).toBe(1);
  });

  it("queues a control that arrives before its target and replays it", async () => {
    const e = ctl("edit", { messageId: "m1", body: "new" }, "2026-01-01T00:00:05Z");
    const p = ctl("pin", { messageId: "m1", pinned: true }, "2026-01-01T00:00:06Z");
    expect(await applyControl(store, e, peer)).toBe("queued");
    expect(await applyControl(store, p, peer)).toBe("queued");
    expect(await store.countMessages(C)).toBe(0);
    await store.upsertMessages([text("m1", "2026-01-01T00:00:00Z")]);
    expect(await replayQueuedControls(store, "m1", ME)).toBe(2);
    expect((await store.getMessage("m1"))?.body).toBe("new");
    expect(await store.getKv(pinKey("m1"))).not.toBeNull();
    expect(await store.listKv("ctl:")).toEqual([]);
  });

  it("an out-of-order delete then edit converges on deleted", async () => {
    await applyControl(store, ctl("delete", { messageId: "m1" }, "2026-01-01T00:00:05Z"), peer);
    await applyControl(
      store,
      ctl("edit", { messageId: "m1", body: "e" }, "2026-01-01T00:00:03Z"),
      peer,
    );
    await store.upsertMessages([text("m1", "2026-01-01T00:00:00Z")]);
    await replayQueuedControls(store, "m1", ME);
    expect((await store.getMessage("m1"))?.deleted).toBe(1);
  });

  it("drops a control for a target in another conversation and bounds the queue", async () => {
    await store.upsertMessages([{ ...text("m1", "2026-01-01T00:00:00Z"), conversation_id: "other" }]);
    const del = ctl("delete", { messageId: "m1" }, "2026-01-01T00:00:01Z");
    expect(await applyControl(store, del, peer)).toBe("dropped");
    for (let i = 0; i < 40; i++) {
      const a = ctl("audio_play", { messageId: "ghost" }, "2026-01-01T00:00:01Z", `q${i}`);
      await applyControl(store, a, peer);
    }
    expect((await store.listKv("ctl:ghost:")).length).toBe(20);
  });

  it("ignores controls without an authenticated sender", async () => {
    const r = ctl("receipt", { messageIds: ["m1"] }, "2026-01-01T00:00:01Z");
    expect(await applyControl(store, r, as(null))).toBe("dropped");
    expect(await store.listReceipts(["m1"])).toEqual([]);
  });

  it("computes unread locally and my other Device's read clears it", async () => {
    await store.upsertMessages([
      text("a", "2026-01-01T00:00:01Z"),
      text("b", "2026-01-01T00:00:02Z"),
      text("mine", "2026-01-01T00:00:03Z", ME),
      text("c", "2026-01-01T00:00:04Z"),
    ]);
    expect(await countLocalUnread(store, C, ME)).toBe(3);
    expect(await markConversationRead(store, C, ME, "2026-01-01T00:00:02Z")).toBe(1);
    // the marker never moves back
    expect(await markConversationRead(store, C, ME, "2026-01-01T00:00:01Z")).toBe(1);
    // my other Device read up to c
    await applyControl(store, ctl("read", { messageIds: ["c"] }, "2026-01-01T00:01:00Z"), self);
    expect(await countLocalUnread(store, C, ME)).toBe(0);
    // and no receipt row was invented for my own account
    expect(await store.listReceipts(["c"])).toEqual([]);
    await store.upsertMessages([text("d", "2026-01-01T00:02:00Z")]);
    expect(await countLocalUnread(store, C, ME)).toBe(1);
  });
});

describe("encrypted handler with controls", () => {
  it("auto-sends one receipt per new text, none for my own, and controls make no bubbles", async () => {
    const exec = createNodeSqliteExecutor();
    const store = createSqlLocalStore(exec);
    await store.init();
    const sent: unknown[] = [];
    let next = "";
    const handler = createEncryptedEnvelopeHandler({
      sessions: { decryptFrom: async () => next } as never,
      store,
      selfUserId: ME,
      sendControl: async (...a) => void sent.push(a),
    });
    const feed = async (p: PlainEnvelope, sender: string) => {
      next = encodePlainEnvelope(p);
      await handler({
        id: p.id,
        recipientDeviceId: "me-d",
        senderDeviceId: "x",
        senderUserId: sender,
        conversationId: C,
        kind: 2,
        payload: new TextEncoder().encode(JSON.stringify({ t: 1, b: "x" })),
      } as never);
    };
    const t1: PlainEnvelope = {
      v: 1,
      id: "t1",
      conversationId: C,
      sentAt: "2026-01-01T00:00:01Z",
      kind: "text",
      body: "hi",
    };
    await feed(t1, PEER);
    await feed(t1, PEER); // duplicate delivery
    expect(sent).toEqual([[C, "receipt", { messageIds: ["t1"] }]]);
    await feed({ ...t1, id: "t2" }, ME);
    expect(sent.length).toBe(1);
    await feed(ctl("edit", { messageId: "t1", body: "hi2" }, "2026-01-01T00:00:09Z"), PEER);
    await feed(t1, PEER); // a redelivery must not undo the edit
    expect((await store.getMessage("t1"))?.body).toBe("hi2");
    expect(await store.countMessages(C)).toBe(2);
    exec.close();
  });
});
