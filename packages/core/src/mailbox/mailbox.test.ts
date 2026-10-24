import { describe, expect, it } from "vitest";

import type { RpcClient } from "../rpc";
import {
  base64ToBytes,
  bytesToBase64,
  createMailboxReceiver,
  decodePlaintext,
  encodePlaintext,
  sendEnvelopes,
  type BroadcastFrame,
  type MailboxEnvelope,
  type WireEnvelope,
} from "./index";

/** A fake server holding one device's mailbox. */
function fakeServer(count: number) {
  const rows: WireEnvelope[] = [];
  for (let i = 1; i <= count; i++) {
    rows.push({
      seq: String(i),
      id: `id-${i}`,
      sender_device_id: "d-sender",
      sender_user_id: "u-sender",
      conversation_id: null,
      kind: 0,
      ciphertext: bytesToBase64(encodePlaintext({ n: i })),
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    async rpc(fn, args = {}) {
      calls.push({ fn, args });
      if (fn === "fetch_mailbox") {
        const after = Number(args.p_after);
        const limit = Math.min(Number(args.p_limit), 500);
        return { data: rows.filter((r) => Number(r.seq) > after).slice(0, limit), error: null };
      }
      if (fn === "ack_envelopes") {
        const ids = new Set(args.p_ids as string[]);
        let n = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (ids.has(rows[i]!.id)) {
            rows.splice(i, 1);
            n++;
          }
        }
        return { data: n, error: null };
      }
      if (fn === "send_envelopes") {
        const batch = args.p_batch as { id: string }[];
        return { data: batch.map((b) => ({ id: b.id, status: "sent" })), error: null };
      }
      return { data: null, error: { message: "platform.unexpected" } };
    },
  };
  return { rows, calls, client };
}

describe("codec", () => {
  it("round-trips bytes and plaintext", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    expect(decodePlaintext(encodePlaintext({ a: "é" }))).toEqual({ a: "é" });
  });
});

describe("receiver paging", () => {
  it("drains 1200 rows as 500/500/200 in creation order and acks each page", async () => {
    const s = fakeServer(1200);
    const got: number[] = [];
    const r = createMailboxReceiver({
      client: s.client,
      deviceId: "d1",
      onEnvelope: (e) => void got.push(e.seq),
    });
    const res = await r.sync();
    expect(res).toEqual({ ok: true, value: 1200 });
    expect(got).toEqual(Array.from({ length: 1200 }, (_, i) => i + 1));
    const fetches = s.calls.filter((c) => c.fn === "fetch_mailbox");
    expect(fetches.map((c) => c.args.p_after)).toEqual([0, 500, 1000]);
    const acks = s.calls.filter((c) => c.fn === "ack_envelopes");
    expect(acks.map((c) => (c.args.p_ids as string[]).length)).toEqual([500, 500, 200]);
    expect(s.rows).toHaveLength(0);
  });
});

describe("receiver dedup", () => {
  it("processes an id once when it arrives by Broadcast and by fetch", async () => {
    const s = fakeServer(1);
    const seen: MailboxEnvelope[] = [];
    const r = createMailboxReceiver({
      client: s.client,
      deviceId: "d1",
      onEnvelope: (e) => void seen.push(e),
    });
    const frame: BroadcastFrame = { type: "envelope", envelope: s.rows[0]! };
    // Fast path delivers first, then a duplicate frame and a catch-up fetch.
    expect(await r.handleFrame(frame)).toEqual({ ok: true, value: 1 });
    expect(await r.handleFrame(frame)).toEqual({ ok: true, value: 0 });
    await r.sync();
    expect(seen).toHaveLength(1);
    expect(decodePlaintext(seen[0]!.payload)).toEqual({ n: 1 });
  });

  it("fetches the row when the broadcast carries only the id", async () => {
    const s = fakeServer(2);
    const seen: string[] = [];
    const r = createMailboxReceiver({
      client: s.client,
      deviceId: "d1",
      onEnvelope: (e) => void seen.push(e.id),
    });
    const res = await r.handleFrame({ type: "ref", id: "id-2" });
    expect(res.ok).toBe(true);
    expect(seen).toEqual(["id-1", "id-2"]);
    // A repeated ref for a processed id does not hit the server again.
    const before = s.calls.length;
    await r.handleFrame({ type: "ref", id: "id-2" });
    expect(s.calls.length).toBe(before);
  });

  it("does not ack a row whose handler threw, and retries it on the next sync", async () => {
    const s = fakeServer(1);
    let fail = true;
    const seen: string[] = [];
    const r = createMailboxReceiver({
      client: s.client,
      deviceId: "d1",
      onEnvelope: (e) => {
        if (fail) throw new Error("boom");
        seen.push(e.id);
      },
    });
    await expect(r.sync()).rejects.toThrow("boom");
    expect(s.rows).toHaveLength(1);
    fail = false;
    await r.sync();
    expect(seen).toEqual(["id-1"]);
    expect(s.rows).toHaveLength(0);
  });
});

describe("sendEnvelopes", () => {
  it("splits batches at 100 and returns one result per envelope", async () => {
    const s = fakeServer(0);
    const envs = Array.from({ length: 250 }, (_, i) => ({
      id: `e-${i}`,
      recipientDeviceId: "r",
      senderDeviceId: "s",
      payload: encodePlaintext({ i }),
    }));
    const res = await sendEnvelopes(s.client, envs);
    expect(res.ok && res.value).toHaveLength(250);
    expect(s.calls.map((c) => (c.args.p_batch as unknown[]).length)).toEqual([100, 100, 50]);
  });
});
