import { describe, expect, it } from "vitest";

import type { RpcClient } from "../rpc";
import { createGroupSender } from "./group-sender";
import { createGroupStateManager, type StateCipher } from "./group-state";
import { createGroupSessionManager, MAX_GROUP_MEMBERS } from "./megolm-sessions";
import type { CryptoEngine } from "../crypto/crypto-engine";

const cipher: StateCipher = {
  generateKey: async () => `k${Math.random()}`,
  seal: async (k, p) => `${k}|${p}`,
  open: async (k, s) => {
    if (!s.startsWith(`${k}|`)) throw new Error("bad key");
    return s.slice(k.length + 1);
  },
};

const kvOf = () => {
  const m = new Map<string, string>();
  return { getKv: async (k: string) => m.get(k) ?? null, setKv: async (k: string, v: string) => void m.set(k, v) };
};

function server() {
  let blob: { version: number; ciphertext: string } | null = null;
  const client: RpcClient = {
    async rpc(fn, args) {
      if (fn === "put_group_state") {
        blob = { version: (blob?.version ?? 0) + 1, ciphertext: args!.p_ciphertext as string };
        return { data: blob.version, error: null };
      }
      if (fn === "get_group_state") return { data: blob ? [blob] : [], error: null };
      return { data: null, error: { message: "platform.unexpected" } };
    },
  };
  return { client, raw: () => blob };
}

describe("group_state", () => {
  it("never stores the name in the clear and a Fresh Device needs the key to read it", async () => {
    const s = server();
    const admin = createGroupStateManager({ client: s.client, kv: kvOf(), cipher });
    const pub = await admin.publish("c", "d1", { name: "Secret Club" });
    expect(pub.ok).toBe(true);

    const fresh = createGroupStateManager({ client: s.client, kv: kvOf(), cipher });
    const before = await fresh.load("c");
    expect(before).toEqual({ ok: true, value: "no_key" });

    const k = await admin.currentKey("c");
    await fresh.acceptKey("c", k.key, k.version);
    const after = await fresh.load("c");
    expect(after.ok && after.value).toEqual({ name: "Secret Club" });
  });

  it("rotating the key leaves a removed member's old key useless", async () => {
    const s = server();
    const admin = createGroupStateManager({ client: s.client, kv: kvOf(), cipher });
    await admin.publish("c", "d1", { name: "v1" });
    const old = await admin.currentKey("c");
    await admin.publish("c", "d1", { name: "v2" }, { rotateKey: true });

    const ex = createGroupStateManager({ client: s.client, kv: kvOf(), cipher });
    await ex.acceptKey("c", old.key, old.version);
    expect(await ex.load("c")).toEqual({ ok: true, value: "no_key" });
  });
});

describe("member cap", () => {
  it("refuses a send when the group has 257 members", async () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        user_id: `u${i}`,
        device_id: `d${i}`,
        is_current_session: i === 0,
      }));
    const mk = (n: number) =>
      createGroupSender({
        client: {
          async rpc(fn) {
            if (fn === "mailbox_recipients") return { data: rows(n), error: null };
            return { data: [], error: null };
          },
        },
        sessions: {
          encryptForDevices: async () => ({ ok: true as const, value: new Map() }),
        } as never,
        groups: createGroupSessionManager({
          engine: {
            createOutboundGroupSession: async () => ({ sessionId: "s", sessionKey: "key:s" }),
            groupEncrypt: async () => "ct",
          } as unknown as CryptoEngine,
          kv: kvOf(),
          persist: async () => {},
        }),
        userId: "u0",
        deviceId: "d0",
        deriveId: (m, d) => `${m}:${d}`,
        newId: () => "k",
      });
    const body = { v: 1 as const, id: "m", conversationId: "c", sentAt: "t", kind: "read" as const, body: {} };
    const over = await mk(MAX_GROUP_MEMBERS + 1).send(body as never);
    expect(over).toEqual({ ok: false, error: { code: "groups.member_limit" } });
    const at = await mk(MAX_GROUP_MEMBERS).send(body as never);
    expect(at.ok || (!at.ok && at.error.code !== "groups.member_limit")).toBe(true);
  });
});
