import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore, type MessageRow } from "../local-store";
import { createNodeSqliteExecutor } from "../local-store/node-sqlite-executor";
import { createControlActions, type ControlSend } from "./control-actions";

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

describe("control actions", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  let sent: { kind: string; body: unknown; id?: string }[];
  let fail: boolean;
  let n: number;

  const send: ControlSend = async (_c, kind, body, meta) => {
    if (fail) return { ok: false } as never;
    sent.push({ kind, body, id: meta?.id });
    return { ok: true, value: undefined } as never;
  };
  const make = () =>
    createControlActions({
      store,
      selfUserId: ME,
      send,
      newId: () => `id-${++n}`,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
    });

  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
    sent = [];
    fail = false;
    n = 0;
  });
  afterEach(() => exec.close());

  it("applies react, edit and delete locally and sends the same control", async () => {
    await store.upsertMessages([text("m1", "2025-12-31T00:00:00Z", ME), text("m2", "2025-12-31T00:00:01Z")]);
    const a = make();
    await a.react(C, "m2", "+1");
    expect((await store.listReactions(["m2"])).map((r) => [r.user_id, r.emoji])).toEqual([[ME, "+1"]]);
    await a.edit(C, "m1", "new");
    expect((await store.getMessage("m1"))?.body).toBe("new");
    await a.remove(C, "m1");
    expect((await store.getMessage("m1"))?.deleted).toBe(1);
    expect(sent.map((s) => s.kind)).toEqual(["reaction", "edit", "delete"]);
  });

  it("markRead advances the marker, sends one read and returns the unread count", async () => {
    await store.upsertMessages([
      text("a", "2026-01-01T00:00:01Z"),
      text("b", "2026-01-01T00:00:02Z"),
      text("mine", "2026-01-01T00:00:03Z", ME),
    ]);
    const a = make();
    expect(await a.markRead(C)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe("read");
    expect([...(sent[0]!.body as { messageIds: string[] }).messageIds].sort()).toEqual(["a", "b"]);
    // nothing new: no second read control
    expect(await a.markRead(C)).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("parks a failed send and flushes it later", async () => {
    await store.upsertMessages([text("m2", "2025-12-31T00:00:01Z")]);
    const a = make();
    fail = true;
    await a.react(C, "m2", "+1");
    expect(sent).toEqual([]);
    expect((await store.listKv("ctlout:")).length).toBe(1);
    expect(await a.flushPendingControls()).toBe(0);
    fail = false;
    expect(await a.flushPendingControls()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "reaction" });
    expect(await store.listKv("ctlout:")).toEqual([]);
  });
});
