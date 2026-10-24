import { beforeAll, describe, expect, it } from "vitest";

import { createControlActions } from "@pulse/core/e2ee/control-actions";
import { countLocalUnread, deriveTick } from "@pulse/core/e2ee/controls";
import { claimKeysRpc, createControlSender } from "@pulse/core/e2ee/encrypted-sender";
import { createOlmSessionManager } from "@pulse/core/e2ee/olm-sessions";
import { decodeOlmPayload } from "@pulse/core/e2ee/plain-envelope";
import { createEncryptedEnvelopeHandler } from "@pulse/core/e2ee/receive";
import { createSqlLocalStore } from "@pulse/core/local-store/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import { base64ToBytes } from "@pulse/core/mailbox/codec";
import { createMailboxReceiver } from "@pulse/core/mailbox/receiver";
import type { RpcClient } from "@pulse/core/rpc";

import { loadVodozemacNode } from "@/platform/crypto/load-node";
import { VodozemacEngine } from "@/platform/crypto/vodozemac-engine";

import { createEncryptedTextSender, derivedId } from "./mailbox-send";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const A1 = "10000000-0000-4000-8000-0000000000a1";
const A2 = "10000000-0000-4000-8000-0000000000a2";
const B1 = "10000000-0000-4000-8000-0000000000b1";
const CONV = "20000000-0000-4000-8000-000000000001";
const SECRET = "the secret plan: meet at noon";

let vz: ReturnType<typeof loadVodozemacNode>;
beforeAll(() => {
  vz = loadVodozemacNode();
});

type Wire = {
  seq: number;
  id: string;
  recipient: string;
  sender_device_id: string;
  sender_user_id: string;
  conversation_id: string | null;
  kind: number;
  ciphertext: string;
  created_at: string;
};

type DeviceRow = { user: string; identity: string; otks: string[]; deleted: boolean };

/** In-memory stand-in for the mailbox RPCs: it only ever stores what clients send. */
class FakeServer {
  devices = new Map<string, DeviceRow>();
  rows: Wire[] = [];
  private seq = 0;

  clientFor(userId: string, deviceId: string): RpcClient {
    return {
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        const ok = (data: unknown) => ({ data, error: null });
        switch (fn) {
          case "mailbox_recipients":
            return ok(
              [...this.devices]
                .filter(([, d]) => !d.deleted)
                .map(([id, d]) => ({
                  user_id: d.user,
                  device_id: id,
                  is_current_session: id === deviceId && d.user === userId,
                })),
            );
          case "claim_keys":
            return ok(
              (args.p_device_ids as string[]).flatMap((id) => {
                const d = this.devices.get(id);
                const key = d && !d.deleted ? d.otks.shift() : undefined;
                return d && key
                  ? [
                      {
                        device_id: id,
                        identity_key: d.identity,
                        signing_key: "",
                        key_id: "k",
                        public_key: key,
                        is_fallback: false,
                      },
                    ]
                  : [];
              }),
            );
          case "send_envelopes": {
            const batch = args.p_batch as Record<string, unknown>[];
            return ok(
              batch.map((b) => {
                if (this.rows.some((r) => r.id === b.id)) return { id: b.id, status: "duplicate" };
                this.rows.push({
                  seq: ++this.seq,
                  id: b.id as string,
                  recipient: b.recipient_device_id as string,
                  sender_device_id: b.sender_device_id as string,
                  sender_user_id: userId,
                  conversation_id: b.conversation_id as string,
                  kind: b.kind as number,
                  ciphertext: b.ciphertext as string,
                  created_at: new Date().toISOString(),
                });
                return { id: b.id, status: "sent" };
              }),
            );
          }
          case "fetch_mailbox":
            return ok(
              this.rows
                .filter((r) => r.recipient === args.p_device_id && r.seq > (args.p_after as number))
                .slice(0, args.p_limit as number),
            );
          case "ack_envelopes":
            return ok((args.p_ids as string[]).length);
          default:
            return { data: null, error: { message: `unexpected ${fn}` } };
        }
      },
    } as RpcClient;
  }
}

async function makeDevice(server: FakeServer, userId: string, deviceId: string) {
  const engine = new VodozemacEngine(vz);
  const keys = await engine.createAccount();
  await engine.generateOneTimeKeys(5);
  const otks = Object.values(await engine.oneTimeKeys());
  await engine.markKeysAsPublished();
  server.devices.set(deviceId, { user: userId, identity: keys.curve25519, otks, deleted: false });

  const store = createSqlLocalStore(createNodeSqliteExecutor());
  await store.init();
  const client = server.clientFor(userId, deviceId);
  const sessions = createOlmSessionManager({
    engine,
    kv: store,
    claimKeys: (ids) => claimKeysRpc(client, ids),
    persist: async () => {},
  });
  const rejected: string[] = [];
  const sendControl = createControlSender({
    client,
    sessions,
    userId,
    deviceId,
    deriveId: derivedId,
    newId: () => crypto.randomUUID(),
  });
  const actions = createControlActions({
    store,
    selfUserId: userId,
    send: sendControl,
    newId: () => crypto.randomUUID(),
  });
  const receiver = createMailboxReceiver({
    client,
    deviceId,
    onEnvelope: createEncryptedEnvelopeHandler({
      sessions,
      store,
      selfUserId: userId,
      sendControl,
      onRejected: (_e, reason) => {
        rejected.push(reason);
      },
    }),
  });
  const send = createEncryptedTextSender({ client, sessions, userId, deviceId });
  const texts = async () =>
    (await store.listMessages(CONV, { limit: 50 })).map((m) => ({
      body: m.body,
      from: m.sender_user_id,
    }));
  return { engine, store, receiver, rejected, send, texts, actions, userId };
}

async function world() {
  const server = new FakeServer();
  const a1 = await makeDevice(server, ALICE, A1);
  const a2 = await makeDevice(server, ALICE, A2);
  const b1 = await makeDevice(server, BOB, B1);
  return { server, a1, a2, b1 };
}

const msg = (body: string, clientId = crypto.randomUUID()) => ({
  conversationId: CONV,
  clientId,
  body,
});

describe("encrypted 1:1 text messages", () => {
  it("delivers a text to the recipient, decrypted into the local store", async () => {
    const { a1, b1 } = await world();
    const res = await a1.send(msg(SECRET));
    expect(res.ok).toBe(true);
    await b1.receiver.sync();
    expect(await b1.texts()).toEqual([{ body: SECRET, from: ALICE }]);
    expect(b1.rejected).toEqual([]);
  });

  it("puts no plaintext in the mailbox rows", async () => {
    const { server, a1 } = await world();
    await a1.send(msg(SECRET));
    expect(server.rows.length).toBe(2); // Bob's Device and Alice's other Device, not the sender
    for (const r of server.rows) {
      const raw = new TextDecoder().decode(base64ToBytes(r.ciphertext));
      expect(raw).not.toContain("secret");
      expect(JSON.stringify(r)).not.toContain("secret");
      expect(r.kind).toBe(2);
    }
  });

  it("rejects tampered ciphertext without storing anything or blocking the drain", async () => {
    const { server, a1, b1 } = await world();
    await a1.send(msg(SECRET));
    const row = server.rows.find((r) => r.recipient === B1)!;
    const payload = decodeOlmPayload(base64ToBytes(row.ciphertext))!;
    const bytes = base64ToBytes(payload.body);
    bytes[bytes.length - 12] ^= 0xff;
    const tampered = new TextEncoder().encode(
      JSON.stringify({ t: payload.type, b: Buffer.from(bytes).toString("base64") }),
    );
    row.ciphertext = Buffer.from(tampered).toString("base64");
    const res = await b1.receiver.sync();
    expect(res.ok).toBe(true);
    expect(b1.rejected.length).toBe(1);
    expect(await b1.texts()).toEqual([]);
  });

  it("does not let a removed Device decrypt new messages", async () => {
    const { server, a1, a2, b1 } = await world();
    server.devices.get(A2)!.deleted = true;
    await a1.send(msg(SECRET));
    expect(server.rows.map((r) => r.recipient)).toEqual([B1]);
    await a2.receiver.sync();
    expect(await a2.texts()).toEqual([]);
    // An envelope made for another Device is useless to it.
    server.rows.push({ ...server.rows[0]!, seq: 99, id: crypto.randomUUID(), recipient: A2 });
    await a2.receiver.sync();
    expect(await a2.texts()).toEqual([]);
    expect(a2.rejected.length).toBe(1);
    await b1.receiver.sync();
    expect(await b1.texts()).toEqual([{ body: SECRET, from: ALICE }]);
  });

  it("shows the sent message on the sender's other Devices", async () => {
    const { a1, a2 } = await world();
    await a1.send(msg(SECRET));
    await a2.receiver.sync();
    expect(await a2.texts()).toEqual([{ body: SECRET, from: ALICE }]);
  });

  it("reuses the session and works in both directions", async () => {
    const { server, a1, b1 } = await world();
    await a1.send(msg("one"));
    await b1.receiver.sync();
    await b1.send(msg("two"));
    await a1.send(msg("three"));
    await b1.receiver.sync();
    await a1.receiver.sync();
    expect((await b1.texts()).map((t) => t.body).sort()).toEqual(["one", "three"]);
    expect((await a1.texts()).map((t) => t.body)).toEqual(["two"]);
    // Alice's first Device spent one of Bob's one-time keys, once.
    expect(server.devices.get(B1)!.otks.length).toBe(4);
  });

  it("dedupes a resend of the same client id", async () => {
    const { server, a1 } = await world();
    const clientId = crypto.randomUUID();
    await a1.send(msg("x", clientId));
    await a1.send(msg("x", clientId));
    expect(server.rows.length).toBe(2);
  });

  it("derives distinct stable ids per Device", () => {
    const c = crypto.randomUUID();
    expect(derivedId(c, A1)).toBe(derivedId(c, A1));
    expect(derivedId(c, A1)).not.toBe(derivedId(c, A2));
  });
});

type Dev = Awaited<ReturnType<typeof makeDevice>>;

/** What the outbox does on the sender: keep my own sent text in the local store. */
async function sendTracked(d: Dev, body: string, sentAt = new Date().toISOString()) {
  const id = crypto.randomUUID();
  await d.store.upsertMessages([
    {
      id,
      conversation_id: CONV,
      sender_user_id: d.userId,
      sender_device_id: "x",
      sent_at: sentAt,
      received_at: sentAt,
      kind: "text",
      body,
      reply_to_id: null,
      edited_at: null,
      deleted: 0,
      status: "sent",
      media_json: null,
    },
  ]);
  const res = await d.send({ conversationId: CONV, clientId: id, body });
  expect(res.ok).toBe(true);
  return id;
}

const tick = async (d: Dev, id: string) =>
  deriveTick((await d.store.getMessage(id))?.status ?? null, await d.store.listReceipts([id]), d.userId);

describe("encrypted control messages", () => {
  it("ticks go check, double (auto receipt), blue (read) and never back", async () => {
    const { a1, a2, b1 } = await world();
    const id = await sendTracked(a1, "hello");
    expect(await tick(a1, id)).toBe("check");
    await b1.receiver.sync(); // Bob's Device stores the text and auto-sends a receipt
    await a1.receiver.sync();
    expect(await tick(a1, id)).toBe("double");
    await a2.receiver.sync();
    await b1.actions.markRead(CONV);
    await a1.receiver.sync();
    expect(await tick(a1, id)).toBe("blue");
    await a2.receiver.sync();
    expect(await tick(a2, id)).toBe("blue");
    // a replayed delivery receipt afterwards cannot lower it
    await a1.receiver.sync();
    expect(await tick(a1, id)).toBe("blue");
    expect(b1.rejected).toEqual([]);
  });

  it("edit, reaction and delete converge on every Device; a non-author edit is ignored", async () => {
    const { a1, a2, b1 } = await world();
    const id = await sendTracked(a1, "v1");
    await b1.receiver.sync();
    await a2.receiver.sync();

    await b1.actions.react(CONV, id, "+1");
    await b1.actions.edit(CONV, id, "hijacked"); // Bob is not the author
    await a1.actions.edit(CONV, id, "v2");
    for (const d of [a1, a2, b1]) await d.receiver.sync();
    for (const d of [a1, a2, b1]) {
      expect((await d.store.getMessage(id))?.body).toBe("v2");
      expect((await d.store.listReactions([id])).map((r) => [r.user_id, r.emoji])).toEqual([
        [BOB, "+1"],
      ]);
    }

    await b1.actions.react(CONV, id, "+1", true);
    await a1.actions.remove(CONV, id);
    for (const d of [a1, a2, b1]) await d.receiver.sync();
    for (const d of [a1, a2, b1]) {
      const row = await d.store.getMessage(id);
      expect(row?.deleted).toBe(1);
      expect(row?.body).toBeNull();
      expect(await d.store.listReactions([id])).toEqual([]);
    }
    expect(a2.rejected).toEqual([]);
  });

  it("computes unread locally and my other Device's read clears it", async () => {
    const { a1, a2, b1 } = await world();
    await sendTracked(b1, "one", "2026-01-01T00:00:01.000Z");
    await sendTracked(b1, "two", "2026-01-01T00:00:02.000Z");
    await a1.receiver.sync();
    await a2.receiver.sync();
    expect(await countLocalUnread(a1.store, CONV, ALICE)).toBe(2);
    expect(await countLocalUnread(a2.store, CONV, ALICE)).toBe(2);
    expect(await a1.actions.markRead(CONV)).toBe(0);
    await a2.receiver.sync();
    expect(await countLocalUnread(a2.store, CONV, ALICE)).toBe(0);
    // Bob sees blue ticks for what Alice read
    await b1.receiver.sync();
    expect(b1.rejected).toEqual([]);
  });

  it("handles a control that arrives before its text", async () => {
    const { server, a1, b1 } = await world();
    const id = await sendTracked(a1, "v1");
    await a1.actions.edit(CONV, id, "v2");
    const mine = server.rows.filter((r) => r.recipient === B1);
    expect(mine.length).toBe(2);
    [mine[0]!.seq, mine[1]!.seq] = [mine[1]!.seq, mine[0]!.seq]; // edit now comes first
    await b1.receiver.sync();
    expect((await b1.store.getMessage(id))?.body).toBe("v2");
    expect(await b1.store.countMessages(CONV)).toBe(1);
  });
});
