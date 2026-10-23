import { describe, expect, it } from "vitest";
import { loadEngineState, openSealed, saveEngineState, seal, ENGINE_STATE_NAME } from "./encrypted-state";
import { getLocalStorageKey, type KeyVault } from "./local-key";
import { loadVodozemacNode } from "./load-node";
import { WorkerCryptoEngine, serveCryptoEngine, type MessagePortLike } from "./rpc";
import { MemoryCryptoStateStore } from "./state-store";
import { VodozemacEngine } from "./vodozemac-engine";

const newKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/** Two in-memory ports wired to each other, delivering asynchronously like a Worker. */
function channel(): [MessagePortLike, MessagePortLike] {
  const l: [((e: { data: unknown }) => void)[], ((e: { data: unknown }) => void)[]] = [[], []];
  const port = (me: 0 | 1): MessagePortLike => ({
    postMessage: (m) => queueMicrotask(() => l[me === 0 ? 1 : 0].forEach((f) => f({ data: m }))),
    addEventListener: (_t, f) => void l[me].push(f),
  });
  return [port(0), port(1)];
}

describe("encrypted engine state", () => {
  it("survives a reload through the encrypted store", async () => {
    const key = await newKey();
    const store = new MemoryCryptoStateStore();
    const a = new VodozemacEngine(loadVodozemacNode());
    const ids = await a.createAccount();
    const g = await a.createOutboundGroupSession();
    await saveEngineState(a, store, key);

    const b = new VodozemacEngine(loadVodozemacNode());
    expect(await loadEngineState(b, store, key)).toBe(true);
    expect(await b.identityKeys()).toEqual(ids);
    expect(typeof (await b.groupEncrypt(g.sessionId, "hi"))).toBe("string");
  });

  it("reports empty when nothing is stored", async () => {
    const e = new VodozemacEngine(loadVodozemacNode());
    expect(await loadEngineState(e, new MemoryCryptoStateStore(), await newKey())).toBe(false);
  });

  it("never writes the plain pickle", async () => {
    const key = await newKey();
    const store = new MemoryCryptoStateStore();
    const e = new VodozemacEngine(loadVodozemacNode());
    await e.createAccount();
    const plain = await e.pickle();
    await saveEngineState(e, store, key);
    const stored = store.blobs.get(ENGINE_STATE_NAME)!;
    expect(stored).not.toEqual(plain);
    const text = new TextDecoder("latin1").decode(stored);
    expect(text).not.toContain('"account"');
    expect(text).not.toContain('"v":1');
  });

  it("rejects tampered blobs, wrong keys and swapped names", async () => {
    const key = await newKey();
    const sealed = await seal(key, "engine", new TextEncoder().encode("secret"));
    expect(new TextDecoder().decode(await openSealed(key, "engine", sealed))).toBe("secret");
    const bad = sealed.slice();
    bad[bad.length - 1] ^= 1;
    await expect(openSealed(key, "engine", bad)).rejects.toThrow();
    await expect(openSealed(await newKey(), "engine", sealed)).rejects.toThrow();
    await expect(openSealed(key, "other", sealed)).rejects.toThrow();
  });

  it("uses a fresh IV for every write", async () => {
    const key = await newKey();
    const a = await seal(key, "n", new Uint8Array([1]));
    const b = await seal(key, "n", new Uint8Array([1]));
    expect(a).not.toEqual(b);
  });
});

describe("local storage key", () => {
  const memVault = (): KeyVault & { key?: CryptoKey } => {
    const v: KeyVault & { key?: CryptoKey } = {
      get: async () => v.key,
      put: async (k) => void (v.key = k),
    };
    return v;
  };

  it("web: generates a non-extractable key once and reuses it", async () => {
    const vault = memVault();
    const k1 = await getLocalStorageKey({ vault, desktopKey: undefined });
    expect(k1.extractable).toBe(false);
    expect(await getLocalStorageKey({ vault })).toBe(k1);
  });

  it("desktop: imports the safeStorage key bytes as non-extractable", async () => {
    const raw = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const k = await getLocalStorageKey({ vault: memVault(), desktopKey: async () => raw });
    expect(k.extractable).toBe(false);
    expect(k.algorithm.name).toBe("AES-GCM");
  });

  it("desktop without OS protection falls back to the vault", async () => {
    const vault = memVault();
    await getLocalStorageKey({ vault, desktopKey: async () => null });
    expect(vault.key).toBeDefined();
  });
});

describe("worker RPC", () => {
  it("proxies the engine through a message port, including errors", async () => {
    const [mainSide, workerSide] = channel();
    serveCryptoEngine(new VodozemacEngine(loadVodozemacNode()), workerSide);
    const client = new WorkerCryptoEngine(mainSide);

    const alice = await client.createAccount();
    const g = await client.createOutboundGroupSession();
    const ct = await client.groupEncrypt(g.sessionId, "over rpc");
    const id = await client.createInboundGroupSession(g.sessionKey);
    expect(await client.groupDecrypt(id, ct)).toEqual({ plaintext: "over rpc", messageIndex: 0 });
    expect(alice.ed25519).toBeTruthy();
    expect(await client.pickle()).toBeInstanceOf(Uint8Array);
    await expect(client.groupEncrypt("nope", "x")).rejects.toThrow("unknown outbound group session");
  });
});
