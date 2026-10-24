import { describe, expect, it } from "vitest";

import type { CryptoEngine } from "../crypto/crypto-engine";
import { createGroupSessionManager, MEGOLM_ROTATE_MESSAGES, MEGOLM_ROTATE_MS } from "./megolm-sessions";

let counter = 0;

/** Just the Megolm half of the engine: a toy cipher, enough to test key distribution. */
function fakeEngine(): CryptoEngine {
  const out = new Set<string>();
  const inbound = new Set<string>();
  return {
    async createOutboundGroupSession() {
      const sessionId = `s${++counter}`;
      out.add(sessionId);
      return { sessionId, sessionKey: `key:${sessionId}` };
    },
    async groupEncrypt(id: string, text: string) {
      if (!out.has(id)) throw new Error("unknown outbound");
      return `ct:${id}:${text}`;
    },
    async createInboundGroupSession(key: string) {
      if (!key.startsWith("key:")) throw new Error("bad key");
      const id = key.slice(4);
      inbound.add(id);
      return id;
    },
    async groupDecrypt(id: string, ct: string) {
      if (!inbound.has(id) || !ct.startsWith(`ct:${id}:`)) throw new Error("cannot decrypt");
      return { plaintext: ct.slice(`ct:${id}:`.length), messageIndex: 0 };
    },
  } as unknown as CryptoEngine;
}

function device(now: { t: number } = { t: 1_000_000 }) {
  const map = new Map<string, string>();
  return {
    now,
    mgr: createGroupSessionManager({
      engine: fakeEngine(),
      kv: {
        getKv: async (k: string) => map.get(k) ?? null,
        setKv: async (k: string, v: string) => void map.set(k, v),
      },
      persist: async () => {},
      now: () => now.t,
    }),
  };
}

const C = "conv-1";

async function send(alice: ReturnType<typeof device>, devices: string[], text: string) {
  const plan = await alice.mgr.prepareSend(C, devices);
  await alice.mgr.markShared(C, plan.sessionId, plan.shareWith);
  const enc = await alice.mgr.encrypt(C, text);
  return { plan, enc };
}

describe("group session manager", () => {
  it("shares the key once per Device and reuses the session", async () => {
    const a = device();
    const first = await send(a, ["b1", "c1"], "one");
    const second = await send(a, ["b1", "c1"], "two");
    expect(first.plan.shareWith).toEqual(["b1", "c1"]);
    expect(second.plan.shareWith).toEqual([]);
    expect(second.enc.sessionId).toBe(first.enc.sessionId);
  });

  it("decrypts only with the shared key, bound to the sender Device and group", async () => {
    const a = device();
    const b = device();
    const { plan, enc } = await send(a, ["b1"], "hi");
    await expect(b.mgr.decrypt("a1", C, enc.sessionId, enc.ciphertext)).rejects.toThrow("e2ee.no_group_key");
    expect(await b.mgr.acceptSenderKey("a1", C, plan.sessionId, plan.sessionKey)).toBe(true);
    expect(await b.mgr.decrypt("a1", C, enc.sessionId, enc.ciphertext)).toBe("hi");
    await expect(b.mgr.decrypt("evil", C, enc.sessionId, enc.ciphertext)).rejects.toThrow("e2ee.mismatch");
    await expect(b.mgr.decrypt("a1", "other", enc.sessionId, enc.ciphertext)).rejects.toThrow("e2ee.mismatch");
    // a different Device cannot rebind an existing session id
    expect(await b.mgr.acceptSenderKey("evil", C, plan.sessionId, plan.sessionKey)).toBe(false);
  });

  it("rejects a key whose id does not match the claimed session id", async () => {
    const b = device();
    expect(await b.mgr.acceptSenderKey("a1", C, "s999", "key:s1")).toBe(false);
  });

  it("a member who left cannot decrypt new messages", async () => {
    const a = device();
    const bob = device();
    const carol = device();
    const m1 = await send(a, ["b1", "c1"], "before");
    for (const d of [bob, carol]) await d.mgr.acceptSenderKey("a1", C, m1.plan.sessionId, m1.plan.sessionKey);
    // carol leaves: roster no longer lists c1
    const m2 = await send(a, ["b1"], "after");
    expect(m2.plan.rotated).toBe(true);
    expect(m2.enc.sessionId).not.toBe(m1.enc.sessionId);
    expect(m2.plan.shareWith).toEqual(["b1"]);
    await bob.mgr.acceptSenderKey("a1", C, m2.plan.sessionId, m2.plan.sessionKey);
    expect(await bob.mgr.decrypt("a1", C, m2.enc.sessionId, m2.enc.ciphertext)).toBe("after");
    await expect(carol.mgr.decrypt("a1", C, m2.enc.sessionId, m2.enc.ciphertext)).rejects.toThrow(
      "e2ee.no_group_key",
    );
  });

  it("a new member cannot decrypt earlier messages", async () => {
    const a = device();
    const dave = device();
    const m1 = await send(a, ["b1"], "secret history");
    const m2 = await send(a, ["b1", "d1"], "welcome");
    expect(m2.plan.rotated).toBe(true);
    expect(m2.plan.shareWith).toEqual(["b1", "d1"]);
    await dave.mgr.acceptSenderKey("a1", C, m2.plan.sessionId, m2.plan.sessionKey);
    expect(await dave.mgr.decrypt("a1", C, m2.enc.sessionId, m2.enc.ciphertext)).toBe("welcome");
    await expect(dave.mgr.decrypt("a1", C, m1.enc.sessionId, m1.enc.ciphertext)).rejects.toThrow(
      "e2ee.no_group_key",
    );
  });

  it("does not rotate for a Device that joins before any message was sent", async () => {
    const a = device();
    const p1 = await a.mgr.prepareSend(C, ["b1"]);
    const p2 = await a.mgr.prepareSend(C, ["b1", "c1"]);
    expect(p2.rotated).toBe(false);
    expect(p2.sessionId).toBe(p1.sessionId);
    expect(p2.shareWith).toEqual(["b1", "c1"]);
  });

  it("rotates after 100 messages", async () => {
    const a = device();
    const first = await send(a, ["b1"], "m0");
    for (let i = 1; i < MEGOLM_ROTATE_MESSAGES; i++) {
      const r = await send(a, ["b1"], `m${i}`);
      expect(r.enc.sessionId).toBe(first.enc.sessionId);
    }
    const next = await send(a, ["b1"], "m100");
    expect(next.plan.rotated).toBe(true);
    expect(next.enc.sessionId).not.toBe(first.enc.sessionId);
    expect(next.plan.shareWith).toEqual(["b1"]);
  });

  it("rotates after 7 days, not before", async () => {
    const a = device();
    const first = await send(a, ["b1"], "x");
    a.now.t += MEGOLM_ROTATE_MS - 1;
    expect((await send(a, ["b1"], "y")).enc.sessionId).toBe(first.enc.sessionId);
    a.now.t += 1;
    const after = await send(a, ["b1"], "z");
    expect(after.plan.rotated).toBe(true);
    expect(after.enc.sessionId).not.toBe(first.enc.sessionId);
  });

  it("rotates when a Device is removed from a member that stays", async () => {
    const a = device();
    const first = await send(a, ["b1", "b2"], "x");
    const after = await send(a, ["b1"], "y");
    expect(after.plan.rotated).toBe(true);
    expect(after.enc.sessionId).not.toBe(first.enc.sessionId);
  });
});
