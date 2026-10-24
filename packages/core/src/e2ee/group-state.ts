import { callRpc, type RpcClient } from "../rpc";
import { err, ok, type Result } from "../result";
import type { SessionKv } from "./olm-sessions";

/** Encrypted group name, description and photo (spec 5.4). Never seen by the server. */
export type GroupState = { name: string; description?: string; photo?: string | null };

/** Seals the group_state blob with a symmetric key. Default: WebCrypto AES-GCM. */
export type StateCipher = {
  generateKey(): Promise<string>;
  seal(key: string, plaintext: string): Promise<string>;
  open(key: string, sealed: string): Promise<string>;
};

const b64 = (u: Uint8Array) => {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function createWebCryptoStateCipher(): StateCipher {
  const subtle = () => globalThis.crypto.subtle;
  const imp = (key: string) =>
    subtle().importKey("raw", unb64(key), "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    async generateKey() {
      return b64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    },
    async seal(key, plaintext) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(
        await subtle().encrypt(
          { name: "AES-GCM", iv },
          await imp(key),
          new TextEncoder().encode(plaintext),
        ),
      );
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv);
      out.set(ct, iv.length);
      return b64(out);
    },
    async open(key, sealed) {
      const raw = unb64(sealed);
      const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: raw.slice(0, 12) },
        await imp(key),
        raw.slice(12),
      );
      return new TextDecoder().decode(pt);
    },
  };
}

type StateRow = { version: number; ciphertext: string };
const KEY = (c: string) => `gstate.key.${c}`;
export type StoredStateKey = { key: string; version: number };

export type GroupStateManager = {
  /** Current key for the group, creating version 1 when none exists. */
  currentKey(conversationId: string): Promise<StoredStateKey>;
  /** Stores a key received from another Device. The first key for a version wins. */
  acceptKey(conversationId: string, key: string, version: number): Promise<void>;
  /** Encrypts and uploads the state. `rotateKey` bumps the key version (member left). */
  publish(
    conversationId: string,
    deviceId: string,
    state: GroupState,
    opts?: { rotateKey?: boolean; expectedVersion?: number },
  ): Promise<Result<{ version: number; key: StoredStateKey }>>;
  /** Fetches and decrypts the state; "no_key" until a member Device shared the key. */
  load(conversationId: string): Promise<Result<GroupState | "no_key" | null>>;
};

export function createGroupStateManager(opts: {
  client: RpcClient;
  kv: SessionKv;
  cipher?: StateCipher;
}): GroupStateManager {
  const cipher = opts.cipher ?? createWebCryptoStateCipher();
  const { kv } = opts;
  const readKeys = async (c: string): Promise<Record<string, string>> => {
    const raw = await kv.getKv(KEY(c));
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const latest = (m: Record<string, string>): StoredStateKey | null => {
    const vs = Object.keys(m).map(Number);
    if (vs.length === 0) return null;
    const version = Math.max(...vs);
    return { key: m[String(version)]!, version };
  };
  const self: GroupStateManager = {
    async currentKey(c) {
      const cur = latest(await readKeys(c));
      if (cur) return cur;
      const key = await cipher.generateKey();
      await kv.setKv(KEY(c), JSON.stringify({ "1": key }));
      return { key, version: 1 };
    },
    async acceptKey(c, key, version) {
      const keys = await readKeys(c);
      if (keys[String(version)]) return;
      keys[String(version)] = key;
      await kv.setKv(KEY(c), JSON.stringify(keys));
    },
    async publish(c, deviceId, state, o) {
      let key = await self.currentKey(c);
      if (o?.rotateKey) {
        const next = { key: await cipher.generateKey(), version: key.version + 1 };
        await self.acceptKey(c, next.key, next.version);
        key = next;
      }
      const sealed = await cipher.seal(key.key, JSON.stringify(state));
      const blob = b64(new TextEncoder().encode(JSON.stringify({ k: key.version, s: sealed })));
      const res = await callRpc<number>(opts.client, "put_group_state", {
        p_conversation_id: c,
        p_device_id: deviceId,
        p_ciphertext: blob,
        p_expected_version: o?.expectedVersion ?? 0,
      });
      if (!res.ok) return res;
      return ok({ version: res.value, key });
    },
    async load(c) {
      const res = await callRpc<StateRow[] | null>(opts.client, "get_group_state", {
        p_conversation_id: c,
      });
      if (!res.ok) return res;
      const row = res.value?.[0];
      if (!row) return ok(null);
      try {
        const env = JSON.parse(new TextDecoder().decode(unb64(row.ciphertext))) as {
          k: number;
          s: string;
        };
        const key = (await readKeys(c))[String(env.k)];
        if (!key) return ok("no_key");
        const st = JSON.parse(await cipher.open(key, env.s)) as GroupState;
        if (typeof st.name !== "string") return err("e2ee.malformed");
        return ok(st);
      } catch {
        return err("e2ee.decrypt_failed");
      }
    },
  };
  return self;
}
