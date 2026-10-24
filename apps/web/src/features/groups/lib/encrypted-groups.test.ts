import { beforeAll, describe, expect, it } from "vitest";

import { claimKeysRpc } from "@pulse/core/e2ee/encrypted-sender";
import { createGroupSender } from "@pulse/core/e2ee/group-sender";
import { createGroupStateManager } from "@pulse/core/e2ee/group-state";
import {
  createGroupSessionManager,
  MAX_GROUP_MEMBERS,
} from "@pulse/core/e2ee/megolm-sessions";
import { createOlmSessionManager } from "@pulse/core/e2ee/olm-sessions";
import { GROUP_ENVELOPE_KIND } from "@pulse/core/e2ee/plain-envelope";
import { createEncryptedEnvelopeHandler } from "@pulse/core/e2ee/receive";
import { createSqlLocalStore } from "@pulse/core/local-store/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import { base64ToBytes } from "@pulse/core/mailbox/codec";
import { createMailboxReceiver } from "@pulse/core/mailbox/receiver";
import type { RpcClient } from "@pulse/core/rpc";

import {
  createAdminLookup,
  createConversationSendRouter,
} from "@/features/groups/lib/send-router";
import { derivedId } from "@/features/direct-messaging/lib/mailbox-send";
import { loadVodozemacNode } from "@/platform/crypto/load-node";
import { VodozemacEngine } from "@/platform/crypto/vodozemac-engine";

const CONV = "20000000-0000-4000-8000-000000000001";
const user = (c: string) => `00000000-0000-4000-8000-0000000000${c}`;
const dev = (c: string) => `10000000-0000-4000-8000-0000000000${c}`;
const ALICE = user("a1");
const BOB = user("b1");
const CAROL = user("c1");
const DAVE = user("d1");
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
type DeviceRow = {
  user: string;
  identity: string;
  otks: string[];
  deleted: boolean;
};

/** In-memory stand-in for the mailbox and group_state RPCs: it only stores what clients send. */
class FakeServer {
  devices = new Map<string, DeviceRow>();
  members = new Set<string>();
  admins = new Set<string>([ALICE]);
  rows: Wire[] = [];
  state: { version: number; ciphertext: string } | null = null;
  private seq = 0;

  clientFor(userId: string, deviceId: string): RpcClient {
    return {
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        const ok = (data: unknown) => ({ data, error: null });
        switch (fn) {
          case "mailbox_recipients":
            return ok(
              [...this.devices]
                .filter(([, d]) => !d.deleted && this.members.has(d.user))
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
                if (this.rows.some((r) => r.id === b.id))
                  return { id: b.id, status: "duplicate" };
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
                .filter(
                  (r) =>
                    r.recipient === args.p_device_id &&
                    r.seq > (args.p_after as number),
                )
                .slice(0, args.p_limit as number),
            );
          case "ack_envelopes":
            return ok((args.p_ids as string[]).length);
          case "groups_get":
            return ok([{ id: args.p_conversation_id, my_role: "member" }]);
          case "groups_list_members":
            return ok(
              [...this.devices.values()]
                .filter(
                  (d, i, a) =>
                    this.members.has(d.user) &&
                    a.findIndex((x) => x.user === d.user) === i,
                )
                .map((d) => ({
                  user_id: d.user,
                  role: this.admins.has(d.user) ? "admin" : "member",
                })),
            );
          case "put_group_state":
            this.state = {
              version: (this.state?.version ?? 0) + 1,
              ciphertext: args.p_ciphertext as string,
            };
            return ok(this.state.version);
          case "get_group_state":
            return ok(this.state ? [this.state] : []);
          default:
            return { data: null, error: { message: `unexpected ${fn}` } };
        }
      },
    } as RpcClient;
  }
}

async function makeDevice(
  server: FakeServer,
  userId: string,
  deviceId: string,
) {
  const engine = new VodozemacEngine(vz);
  const keys = await engine.createAccount();
  await engine.generateOneTimeKeys(10);
  const otks = Object.values(await engine.oneTimeKeys());
  await engine.markKeysAsPublished();
  server.devices.set(deviceId, {
    user: userId,
    identity: keys.curve25519,
    otks,
    deleted: false,
  });
  server.members.add(userId);

  const store = createSqlLocalStore(createNodeSqliteExecutor());
  await store.init();
  const client = server.clientFor(userId, deviceId);
  const persist = async () => {};
  const sessions = createOlmSessionManager({
    engine,
    kv: store,
    claimKeys: (ids) => claimKeysRpc(client, ids),
    persist,
  });
  const clock = { t: Date.now() };
  const groups = createGroupSessionManager({
    engine,
    kv: store,
    persist,
    now: () => clock.t,
  });
  const state = createGroupStateManager({ client, kv: store });
  const rejected: string[] = [];
  const queued: string[] = [];
  const sender = createGroupSender({
    client,
    sessions,
    groups,
    state,
    userId,
    deviceId,
    deriveId: derivedId,
    newId: () => crypto.randomUUID(),
  });
  const receiver = createMailboxReceiver({
    client,
    deviceId,
    onEnvelope: createEncryptedEnvelopeHandler({
      sessions,
      groups,
      store,
      selfUserId: userId,
      onStateKey: (c, key, version) => state.acceptKey(c, key, version),
      isConversationAdmin: createAdminLookup(client),
      onQueued: () => {
        queued.push("e2ee.no_group_key");
      },
      onRejected: (_e, reason) => {
        rejected.push(reason);
      },
    }),
  });
  // The same path the UI text outbox takes (runtime.sendText), group branch.
  const route = createConversationSendRouter({
    client,
    userId,
    groupSender: sender,
    sendDirect: async () => {
      throw new Error("a group must not take the 1:1 path");
    },
  });
  const say = async (body: string) => {
    const r = await route({
      conversationId: CONV,
      clientId: crypto.randomUUID(),
      body,
    });
    return r.ok ? ({ ok: true } as const) : r;
  };
  const texts = async () =>
    (await store.listMessages(CONV, { limit: 50 })).map((m) => m.body).sort();
  return {
    server,
    state,
    sender,
    receiver,
    rejected,
    queued,
    say,
    texts,
    clock,
    deviceId,
  };
}

describe("encrypted group messages (Megolm)", () => {
  it("delivers to every member Device with no plaintext on the server", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    const b = await makeDevice(server, BOB, dev("b1"));
    const c = await makeDevice(server, CAROL, dev("c1"));
    expect((await a.say(SECRET)).ok).toBe(true);
    await b.receiver.sync();
    await c.receiver.sync();
    expect(await b.texts()).toEqual([SECRET]);
    expect(await c.texts()).toEqual([SECRET]);
    expect(b.rejected).toEqual([]);
    for (const r of server.rows) {
      expect(
        new TextDecoder().decode(base64ToBytes(r.ciphertext)),
      ).not.toContain("secret");
    }
    // one Megolm ciphertext fanned out to two members, plus their Olm key shares
    expect(
      server.rows.filter((r) => r.kind === GROUP_ENVELOPE_KIND).length,
    ).toBe(2);
  });

  it("a member who left cannot decrypt new messages", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    const b = await makeDevice(server, BOB, dev("b1"));
    const c = await makeDevice(server, CAROL, dev("c1"));
    await a.say("before leaving");
    await b.receiver.sync();
    await c.receiver.sync();
    expect(await c.texts()).toEqual(["before leaving"]);

    server.members.delete(CAROL);
    await a.say("after leaving");
    await b.receiver.sync();
    await c.receiver.sync();
    expect(await b.texts()).toEqual(["after leaving", "before leaving"]);
    expect(await c.texts()).toEqual(["before leaving"]);

    // even if the server handed her the new group ciphertext she holds no key for it
    const leaked = server.rows
      .filter(
        (r) => r.recipient === dev("b1") && r.kind === GROUP_ENVELOPE_KIND,
      )
      .at(-1)!;
    server.rows.push({
      ...leaked,
      id: crypto.randomUUID(),
      recipient: dev("c1"),
      seq: 999,
    });
    await c.receiver.sync();
    expect(c.queued).toContain("e2ee.no_group_key");
    expect(await c.texts()).toEqual(["before leaving"]);
  });

  it("a new member cannot decrypt earlier messages", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    const b = await makeDevice(server, BOB, dev("b1"));
    await a.say("history");
    await b.receiver.sync();

    const d = await makeDevice(server, DAVE, dev("d1"));
    await a.say("welcome Dave");
    await d.receiver.sync();
    expect(await d.texts()).toEqual(["welcome Dave"]);

    // replaying the old ciphertext to Dave does not decrypt
    const old = server.rows.find(
      (r) => r.recipient === dev("b1") && r.kind === GROUP_ENVELOPE_KIND,
    )!;
    server.rows.push({
      ...old,
      id: crypto.randomUUID(),
      recipient: dev("d1"),
      seq: 999,
    });
    await d.receiver.sync();
    expect(d.queued).toContain("e2ee.no_group_key");
    expect(await d.texts()).toEqual(["welcome Dave"]);
  });

  it("a Fresh Device shows the group name from the encrypted group_state", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    const b = await makeDevice(server, BOB, dev("b1"));
    const pub = await a.state.publish(CONV, dev("a1"), {
      name: "Weekend Hikers",
      description: "trails",
    });
    expect(pub.ok).toBe(true);
    // the server holds only ciphertext
    expect(atob(server.state!.ciphertext)).not.toContain("Weekend");
    expect(JSON.stringify(server.state)).not.toContain("Weekend");

    // Bob signs in on a brand new Device and has no key yet
    const fresh = await makeDevice(server, BOB, dev("b2"));
    expect(await fresh.state.load(CONV)).toEqual({ ok: true, value: "no_key" });

    await a.say("hello everyone");
    await fresh.receiver.sync();
    await b.receiver.sync();
    const shown = await fresh.state.load(CONV);
    expect(shown.ok && shown.value).toEqual({
      name: "Weekend Hikers",
      description: "trails",
    });
  });

  it("ignores a group_state_key sent by a non-admin member", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    const b = await makeDevice(server, BOB, dev("b1"));
    const c = await makeDevice(server, CAROL, dev("c1"));
    // Bob is a plain member: his state key must not be adopted by Carol
    expect((await b.sender.shareStateKey(CONV)).ok).toBe(true);
    await c.receiver.sync();
    expect(c.rejected).toContain("e2ee.not_admin");
    await a.state.publish(CONV, dev("a1"), { name: "Real", description: "" });
    expect(await c.state.load(CONV)).toEqual({ ok: true, value: "no_key" });
  });

  it("refuses the 257th member", async () => {
    const server = new FakeServer();
    const a = await makeDevice(server, ALICE, dev("a1"));
    for (let i = 0; i < MAX_GROUP_MEMBERS - 1; i++) {
      server.devices.set(`f${i}`, {
        user: `u${i}`,
        identity: "x",
        otks: [],
        deleted: false,
      });
      server.members.add(`u${i}`);
    }
    // 256 members: the cap is not hit (stub members have no keys, so the send fails elsewhere)
    const atCap = await a.say("x");
    expect(!atCap.ok && atCap.error.code).not.toBe("groups.member_limit");
    server.devices.set("f-extra", {
      user: "u-extra",
      identity: "x",
      otks: [],
      deleted: false,
    });
    server.members.add("u-extra");
    const over = await a.say("x");
    expect(over).toEqual({ ok: false, error: { code: "groups.member_limit" } });
  });
});
