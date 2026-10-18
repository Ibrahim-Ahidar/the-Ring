import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getConversation,
  getConversationReceipts,
  listConversations,
  listMessages,
  markDelivered,
  markRead,
  openDirect,
  sendText,
} from "@/features/direct-messaging/service";

import { asSuperuser, createTestDb, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createTestUser(
  options: {
    username: string;
    profileOverrides?: Record<string, unknown>;
  },
): Promise<TestUser> {
  const id = randomUUID();
  const email = `${options.username}@pulse.test`;
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify({ username: options.username })],
  );
  if (options.profileOverrides && Object.keys(options.profileOverrides).length > 0) {
    const keys = Object.keys(options.profileOverrides);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    await asSuperuser(
      db,
      `update public.profiles set ${sets} where id = $1`,
      [id, ...keys.map((k) => options.profileOverrides![k])],
    );
  }
  return { id, username: options.username };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

describe("openDirect", () => {
  it("creates one conversation and returns the same on second call", async () => {
    const alice = await createTestUser({ username: "dm_alice" });
    await createTestUser({ username: "dm_bob" });
    const aliceRpc = createRpcClient(db, alice.id);

    const first = await openDirect(aliceRpc, { username: "dm_bob" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await openDirect(aliceRpc, { username: "dm_bob" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.conversationId).toBe(first.value.conversationId);

    const rows = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.conversations where type = 'direct'`,
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });

  it("returns not_allowed on deny and request_required on request", async () => {
    const actor = await createTestUser({ username: "dm_actor" });
    const denyTarget = await createTestUser({
      username: "dm_deny_tgt",
      profileOverrides: { who_can_message: "nobody" },
    });
    const reqTarget = await createTestUser({
      username: "dm_req_tgt",
      profileOverrides: { who_can_message: "requests" },
    });
    const rpc = createRpcClient(db, actor.id);

    const denied = await openDirect(rpc, { username: "dm_deny_tgt" });
    expect(denied).toEqual({ ok: false, error: { code: "messaging.not_allowed" } });

    const request = await openDirect(rpc, { username: "dm_req_tgt" });
    expect(request).toEqual({
      ok: false,
      error: { code: "messaging.request_required" },
    });

    const pairRows = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count
       from public.conversations c
       where c.type = 'direct'
         and (
           c.direct_pair_key = public.direct_pair_key($1::uuid, $2::uuid)
           or c.direct_pair_key = public.direct_pair_key($1::uuid, $3::uuid)
         )`,
      [actor.id, denyTarget.id, reqTarget.id],
    );
    expect(Number(pairRows.rows[0]?.count)).toBe(0);
  });
});

describe("sendText and listMessages", () => {
  it("stores text visible to both members; outsider is not_member", async () => {
    const alice = await createTestUser({ username: "send_alice" });
    const bob = await createTestUser({ username: "send_bob" });
    const outsider = await createTestUser({ username: "send_out" });
    const aliceRpc = createRpcClient(db, alice.id);
    const bobRpc = createRpcClient(db, bob.id);
    const outRpc = createRpcClient(db, outsider.id);

    const opened = await openDirect(aliceRpc, { username: "send_bob" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const conversationId = opened.value.conversationId;

    const clientId = randomUUID();
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId,
      body: "  hello world  ",
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.body).toBe("hello world");

    const aliceList = await listMessages(aliceRpc, { conversationId });
    const bobList = await listMessages(bobRpc, { conversationId });
    expect(aliceList.ok && bobList.ok).toBe(true);
    if (!aliceList.ok || !bobList.ok) return;
    expect(aliceList.value.items[0]?.body).toBe("hello world");
    expect(bobList.value.items[0]?.body).toBe("hello world");

    const blocked = await sendText(outRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "nope",
    });
    expect(blocked).toEqual({ ok: false, error: { code: "messaging.not_member" } });
  });

  it("clamps list_messages p_limit to 20..60 and defaults to 40", async () => {
    const alice = await createTestUser({ username: "clamp_alice" });
    await createTestUser({ username: "clamp_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: "clamp_bob" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const conversationId = opened.value.conversationId;
    // Seeded directly: sendText is rate limited.
    await asSuperuser(
      db,
      `insert into public.messages (conversation_id, sender_id, client_id, type, body)
       select $1, $2, gen_random_uuid(), 'text', 'm' || g from generate_series(1, 65) g`,
      [conversationId, alice.id],
    );
    const count = async (limit?: number) => {
      const page = await listMessages(aliceRpc, { conversationId, limit });
      expect(page.ok).toBe(true);
      return page.ok ? { n: page.value.items.length, more: page.value.hasMore } : null;
    };
    expect(await count()).toEqual({ n: 40, more: true });
    expect(await count(1)).toEqual({ n: 20, more: true });
    expect(await count(30)).toEqual({ n: 30, more: true });
    expect(await count(500)).toEqual({ n: 60, more: true });
  });

  it("returns each message's attachments and reactions", async () => {
    const alice = await createTestUser({ username: "att_alice" });
    const bob = await createTestUser({ username: "att_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const bobRpc = createRpcClient(db, bob.id);
    const opened = await openDirect(aliceRpc, { username: "att_bob" });
    if (!opened.ok) throw new Error(opened.error.code);
    const sent = await sendText(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "with extras",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    await asSuperuser(
      db,
      `insert into public.attachments (message_id, storage_path, mime_type, size_bytes, file_name)
       values ($1, 'c/m/file.pdf', 'application/pdf', 1024, 'file.pdf')`,
      [sent.value.id],
    );
    await asSuperuser(
      db,
      `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`,
      [sent.value.id, bob.id],
    );

    const list = await listMessages(bobRpc, { conversationId: opened.value.conversationId });
    if (!list.ok) throw new Error(list.error.code);
    const message = list.value.items.find((item) => item.id === sent.value.id);
    expect(message?.attachments).toEqual([
      expect.objectContaining({ mime_type: "application/pdf", file_name: "file.pdf" }),
    ]);
    expect(message?.reactions).toEqual([
      expect.objectContaining({ user_id: bob.id, emoji: "👍" }),
    ]);
  });

  it("is idempotent on sender and client id", async () => {
    const a = await createTestUser({ username: "idem_a" });
    await createTestUser({ username: "idem_b" });
    const aRpc = createRpcClient(db, a.id);
    const opened = await openDirect(aRpc, { username: "idem_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;
    const clientId = randomUUID();

    const first = await sendText(aRpc, {
      conversationId,
      clientId,
      body: "once",
    });
    const second = await sendText(aRpc, {
      conversationId,
      clientId,
      body: "once",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);

    const count = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it("rejects restricted members", async () => {
    const a = await createTestUser({ username: "rest_a" });
    await createTestUser({ username: "rest_b" });
    const aRpc = createRpcClient(db, a.id);
    const opened = await openDirect(aRpc, { username: "rest_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    await asSuperuser(
      db,
      `update public.conversation_members
       set messaging_restricted = true
       where conversation_id = $1 and user_id = $2`,
      [conversationId, a.id],
    );

    const result = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "blocked",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });
  });
});

describe("markRead and unread counts", () => {
  it("moves cursor forward and ignores backward ids", async () => {
    const a = await createTestUser({ username: "read_a" });
    const b = await createTestUser({ username: "read_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "read_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const m1 = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "one",
    });
    const m2 = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "two",
    });
    if (!m1.ok || !m2.ok) throw new Error("send failed");

    const listBefore = await listConversations(bRpc, {});
    expect(listBefore.ok).toBe(true);
    if (!listBefore.ok) return;
    expect(listBefore.value.items[0]?.unread_count).toBe(2);

    const marked = await markRead(bRpc, {
      conversationId,
      messageId: m2.value.id,
    });
    expect(marked.ok).toBe(true);

    const backward = await markRead(bRpc, {
      conversationId,
      messageId: m1.value.id,
    });
    expect(backward.ok).toBe(true);
    if (!backward.ok) return;
    expect(backward.value.last_read_message_id).toBe(m2.value.id);

    const listAfter = await listConversations(bRpc, {});
    expect(listAfter.ok).toBe(true);
    if (!listAfter.ok) return;
    expect(listAfter.value.items[0]?.unread_count).toBe(0);
  });

  it("does not count own messages as unread", async () => {
    const a = await createTestUser({ username: "own_a" });
    await createTestUser({ username: "own_b" });
    const aRpc = createRpcClient(db, a.id);
    const opened = await openDirect(aRpc, { username: "own_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "mine",
    });

    const list = await listConversations(aRpc, {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.items[0]?.unread_count).toBe(0);
  });
});

describe("hides and deleted-for-everyone", () => {
  it("omits hidden messages for one user and tombstones for everyone", async () => {
    const a = await createTestUser({ username: "hid_a" });
    const b = await createTestUser({ username: "hid_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "hid_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const msg = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "secret",
    });
    if (!msg.ok) throw new Error("send failed");

    await asSuperuser(
      db,
      `insert into public.message_hides (message_id, user_id) values ($1, $2)`,
      [msg.value.id, b.id],
    );

    const bList = await listMessages(bRpc, { conversationId });
    expect(bList.ok).toBe(true);
    if (!bList.ok) return;
    expect(bList.value.items).toHaveLength(0);

    const aList = await listMessages(aRpc, { conversationId });
    expect(aList.ok).toBe(true);
    if (!aList.ok) return;
    expect(aList.value.items[0]?.body).toBe("secret");

    await asSuperuser(
      db,
      `update public.messages
       set deletion_scope = 'everyone', body = null, deleted_at = now()
       where id = $1`,
      [msg.value.id],
    );

    const aAfter = await listMessages(aRpc, { conversationId });
    const bAfter = await listMessages(bRpc, { conversationId });
    expect(aAfter.ok && bAfter.ok).toBe(true);
    if (!aAfter.ok || !bAfter.ok) return;
    expect(aAfter.value.items[0]?.body).toBeNull();
    expect(aAfter.value.items[0]?.deletion_scope).toBe("everyone");
    expect(bAfter.value.items).toHaveLength(0);
  });
});

describe("list filters and access control", () => {
  it("filters archived and folder conversations", async () => {
    const owner = await createTestUser({ username: "filt_own" });
    const peer = await createTestUser({ username: "filt_peer" });
    const rpc = createRpcClient(db, owner.id);
    const opened = await openDirect(rpc, { username: "filt_peer" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    await sendText(rpc, {
      conversationId,
      clientId: randomUUID(),
      body: "hi",
    });

    await asSuperuser(
      db,
      `update public.conversation_members set archived_at = now()
       where conversation_id = $1 and user_id = $2`,
      [conversationId, owner.id],
    );

    const hidden = await listConversations(rpc, {});
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.value.items).toHaveLength(0);

    const shown = await listConversations(rpc, { archivedOnly: true });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.value.items).toHaveLength(1);

    await asSuperuser(
      db,
      `update public.conversation_members set archived_at = null
       where conversation_id = $1 and user_id = $2`,
      [conversationId, owner.id],
    );

    const folderId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.chat_folders (id, user_id, name) values ($1, $2, 'Work')`,
      [folderId, owner.id],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_folder_items (folder_id, conversation_id)
       values ($1, $2)`,
      [folderId, conversationId],
    );

    const inFolder = await listConversations(rpc, { folderId });
    expect(inFolder.ok).toBe(true);
    if (!inFolder.ok) return;
    expect(inFolder.value.items).toHaveLength(1);

    const badFolder = await listConversations(rpc, { folderId: randomUUID() });
    expect(badFolder).toEqual({
      ok: false,
      error: { code: "messaging.not_found" },
    });

    void peer;
  });

  it("denies getConversation to a third user", async () => {
    const a = await createTestUser({ username: "gc_a" });
    await createTestUser({ username: "gc_b" });
    const c = await createTestUser({ username: "gc_c" });
    const aRpc = createRpcClient(db, a.id);
    const cRpc = createRpcClient(db, c.id);
    const opened = await openDirect(aRpc, { username: "gc_b" });
    if (!opened.ok) throw new Error("open failed");

    const allowed = await getConversation(aRpc, {
      conversationId: opened.value.conversationId,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.value.role).toBe("member");

    await asSuperuser(
      db,
      `update public.conversation_members set role = 'admin'
       where conversation_id = $1 and user_id = $2`,
      [opened.value.conversationId, a.id],
    );
    const promoted = await getConversation(aRpc, {
      conversationId: opened.value.conversationId,
    });
    expect(promoted.ok && promoted.value.role).toBe("admin");

    const denied = await getConversation(cRpc, {
      conversationId: opened.value.conversationId,
    });
    expect(denied).toEqual({ ok: false, error: { code: "messaging.not_member" } });
  });
});

describe("review regressions", () => {
  it("refuses sends in an existing direct chat after either side blocks", async () => {
    const a = await createTestUser({ username: "blk_a" });
    const b = await createTestUser({ username: "blk_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "blk_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [b.id, a.id],
    );

    const fromBlocked = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "hello?",
    });
    expect(fromBlocked).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });

    const fromBlocker = await sendText(bRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "bye",
    });
    expect(fromBlocker).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });
  });

  it("hides the other read cursor when their read receipts are off", async () => {
    const a = await createTestUser({ username: "rr_a" });
    const b = await createTestUser({
      username: "rr_b",
      profileOverrides: { send_read_receipts: false },
    });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "rr_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const sent = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "read me",
    });
    if (!sent.ok) throw new Error("send failed");
    const marked = await markRead(bRpc, { conversationId, messageId: sent.value.id });
    expect(marked.ok).toBe(true);

    const detail = await getConversation(aRpc, { conversationId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.other_send_read_receipts).toBe(false);
    expect(detail.value.other_last_read_message_id).toBeNull();
    expect(detail.value.other_last_read_created_at).toBeNull();
  });

  it("moves a sent message through delivered to read", async () => {
    const a = await createTestUser({ username: "dl_a" });
    const b = await createTestUser({ username: "dl_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "dl_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const sent = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "ping",
    });
    if (!sent.ok) throw new Error("send failed");

    const before = await getConversationReceipts(aRpc, { conversationIds: [conversationId] });
    expect(before).toEqual({ ok: true, value: { [conversationId]: { status: "sent", messageId: sent.value.id } } });
    const detailBefore = await getConversation(aRpc, { conversationId });
    if (!detailBefore.ok) throw new Error("detail failed");
    expect(detailBefore.value.other_last_delivered_at).toBeNull();

    expect((await markDelivered(bRpc, {})).ok).toBe(true);
    const delivered = await getConversationReceipts(aRpc, {
      conversationIds: [conversationId],
    });
    expect(delivered).toEqual({ ok: true, value: { [conversationId]: { status: "delivered", messageId: sent.value.id } } });
    const detailDelivered = await getConversation(aRpc, { conversationId });
    if (!detailDelivered.ok) throw new Error("detail failed");
    expect(detailDelivered.value.other_last_delivered_at).not.toBeNull();

    expect((await markRead(bRpc, { conversationId, messageId: sent.value.id })).ok).toBe(true);
    const read = await getConversationReceipts(aRpc, { conversationIds: [conversationId] });
    expect(read).toEqual({ ok: true, value: { [conversationId]: { status: "read", messageId: sent.value.id } } });

    // The recipient's own list has no receipt: the newest message is not theirs.
    const forB = await getConversationReceipts(bRpc, { conversationIds: [conversationId] });
    expect(forB).toEqual({ ok: true, value: {} });
  });

  it("treats reading as delivery even without a delivery ack", async () => {
    const a = await createTestUser({ username: "dr_a" });
    const b = await createTestUser({ username: "dr_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "dr_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;
    const sent = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "seen?",
    });
    if (!sent.ok) throw new Error("send failed");
    await markRead(bRpc, { conversationId, messageId: sent.value.id });
    const detail = await getConversation(aRpc, { conversationId });
    if (!detail.ok) throw new Error("detail failed");
    expect(detail.value.other_last_delivered_at).not.toBeNull();
    expect(detail.value.other_last_read_message_id).toBe(sent.value.id);
  });

  it("previews the latest message the caller has not hidden", async () => {
    const a = await createTestUser({ username: "pv_a" });
    const b = await createTestUser({ username: "pv_b" });
    const aRpc = createRpcClient(db, a.id);
    const bRpc = createRpcClient(db, b.id);
    const opened = await openDirect(aRpc, { username: "pv_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    await sendText(aRpc, { conversationId, clientId: randomUUID(), body: "first" });
    const second = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "second",
    });
    if (!second.ok) throw new Error("send failed");
    await asSuperuser(
      db,
      `insert into public.message_hides (message_id, user_id) values ($1, $2)`,
      [second.value.id, b.id],
    );

    const bList = await listConversations(bRpc, {});
    const aList = await listConversations(aRpc, {});
    if (!bList.ok || !aList.ok) throw new Error("list failed");
    const bItem = bList.value.items.find((item) => item.id === conversationId);
    const aItem = aList.value.items.find((item) => item.id === conversationId);
    expect(bItem?.last_message_preview).toBe("first");
    expect(aItem?.last_message_preview).toBe("second");
  });
});

describe("notify and rate limit", () => {
  it("creates a notification for the recipient on send", async () => {
    const a = await createTestUser({ username: "ntf_a" });
    const b = await createTestUser({ username: "ntf_b" });
    const aRpc = createRpcClient(db, a.id);
    const opened = await openDirect(aRpc, { username: "ntf_b" });
    if (!opened.ok) throw new Error("open failed");

    const sent = await sendText(aRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "ping",
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const rows = await asSuperuser<{ rows: unknown[] }>(
      db,
      `select id from public.notifications
       where recipient_id = $1 and type = 'message.created' and entity_id = $2`,
      [b.id, sent.value.id],
    );
    expect(rows.rows.length).toBe(1);
  });

  it("returns platform.rate_limited when over send limit", async () => {
    const a = await createTestUser({ username: "rl_a" });
    await createTestUser({ username: "rl_b" });
    const aRpc = createRpcClient(db, a.id);
    const opened = await openDirect(aRpc, { username: "rl_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    for (let i = 0; i < 30; i += 1) {
      const r = await sendText(aRpc, {
        conversationId,
        clientId: randomUUID(),
        body: `m${i}`,
      });
      expect(r.ok).toBe(true);
    }

    const limited = await sendText(aRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "one too many",
    });
    expect(limited).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});
