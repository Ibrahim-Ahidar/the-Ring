import { beforeAll, describe, expect, it } from "vitest";
import { loadVodozemacNode } from "./load-node";
import { VodozemacEngine } from "./vodozemac-engine";

let vz: ReturnType<typeof loadVodozemacNode>;
beforeAll(() => {
  vz = loadVodozemacNode();
});

async function pair() {
  const alice = new VodozemacEngine(vz);
  const bob = new VodozemacEngine(vz);
  const aKeys = await alice.createAccount();
  const bKeys = await bob.createAccount();
  await bob.generateOneTimeKeys(2);
  const otk = Object.values(await bob.oneTimeKeys())[0]!;
  await bob.markKeysAsPublished();
  return { alice, bob, aKeys, bKeys, otk };
}

describe("Olm through the CryptoEngine interface", () => {
  it("round-trips Alice -> Bob including the pre-key message, then Bob -> Alice", async () => {
    const { alice, bob, aKeys, bKeys, otk } = await pair();
    const aSession = await alice.createOutboundSession(bKeys.curve25519, otk);
    const first = await alice.encrypt(aSession, "hello bob");
    expect(first.type).toBe(0);

    const inbound = await bob.createInboundSession(first);
    expect(inbound.plaintext).toBe("hello bob");
    expect(inbound.sessionId).toBe(aSession);
    expect(inbound.senderIdentityKey).toBe(aKeys.curve25519);

    const reply = await bob.encrypt(inbound.sessionId, "héllo alice ✓");
    expect(await alice.decrypt(aSession, reply)).toBe("héllo alice ✓");
    const second = await alice.encrypt(aSession, "again");
    expect(second.type).toBe(1);
    expect(await bob.decrypt(inbound.sessionId, second)).toBe("again");
  });

  it("consumes the one-time key and rejects a tampered message", async () => {
    const { alice, bob, aKeys, bKeys, otk } = await pair();
    const s = await alice.createOutboundSession(bKeys.curve25519, otk);
    const m = await alice.encrypt(s, "secret");
    const inbound = await bob.createInboundSession(m);
    expect(Object.values(await bob.oneTimeKeys())).not.toContain(otk);

    const next = await alice.encrypt(s, "second");
    const bytes = Uint8Array.from(atob(next.body), (c) => c.charCodeAt(0));
    bytes[bytes.length - 12] ^= 0xff;
    const tampered = { ...next, body: btoa(String.fromCharCode(...bytes)).replace(/=+$/, "") };
    await expect(bob.decrypt(inbound.sessionId, tampered)).rejects.toBeDefined();
  });

  it("signs and verifies, rejecting a wrong message", async () => {
    const { alice, aKeys } = await pair();
    const sig = await alice.sign("device-list");
    expect(await alice.verify(aKeys.ed25519, "device-list", sig)).toBe(true);
    expect(await alice.verify(aKeys.ed25519, "other", sig)).toBe(false);
  });
});

describe("Megolm through the CryptoEngine interface", () => {
  it("round-trips with message indexes and rejects tampering", async () => {
    const sender = new VodozemacEngine(vz);
    const receiver = new VodozemacEngine(vz);
    const { sessionId, sessionKey } = await sender.createOutboundGroupSession();
    const c0 = await sender.groupEncrypt(sessionId, "one");
    const c1 = await sender.groupEncrypt(sessionId, "two");

    expect(await receiver.createInboundGroupSession(sessionKey)).toBe(sessionId);
    expect(await receiver.groupDecrypt(sessionId, c0)).toEqual({ plaintext: "one", messageIndex: 0 });
    expect(await receiver.groupDecrypt(sessionId, c1)).toEqual({ plaintext: "two", messageIndex: 1 });

    const bytes = Uint8Array.from(atob(c1), (c) => c.charCodeAt(0));
    bytes[bytes.length - 20] ^= 0xff;
    const bad = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
    await expect(receiver.groupDecrypt(sessionId, bad)).rejects.toBeDefined();
  });
});

describe("pickle / unpickle", () => {
  it("restores account, Olm and Megolm state on a fresh engine (simulated reload)", async () => {
    const { alice, bob, aKeys, bKeys, otk } = await pair();
    const s = await alice.createOutboundSession(bKeys.curve25519, otk);
    const m = await alice.encrypt(s, "before reload");
    const inbound = await bob.createInboundSession(m);
    const out = await alice.createOutboundGroupSession();
    await bob.createInboundGroupSession(out.sessionKey);
    const c0 = await alice.groupEncrypt(out.sessionId, "g0");

    const aliceBlob = await alice.pickle();
    const bobBlob = await bob.pickle();
    const alice2 = new VodozemacEngine(vz);
    const bob2 = new VodozemacEngine(vz);
    await alice2.unpickle(aliceBlob);
    await bob2.unpickle(bobBlob);

    expect(await alice2.identityKeys()).toEqual(aKeys);
    const reply = await bob2.encrypt(inbound.sessionId, "after reload");
    expect(await alice2.decrypt(s, reply)).toBe("after reload");
    expect(await bob2.decrypt(inbound.sessionId, await alice2.encrypt(s, "x"))).toBe("x");
    expect((await bob2.groupDecrypt(out.sessionId, c0)).plaintext).toBe("g0");
    const c1 = await alice2.groupEncrypt(out.sessionId, "g1");
    expect(await bob2.groupDecrypt(out.sessionId, c1)).toEqual({ plaintext: "g1", messageIndex: 1 });
  });
});
