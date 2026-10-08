import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listMessages,
  openDirect,
  sendText,
} from "@/features/direct-messaging/service";
import {
  deleteForEveryone,
  editMessage,
  forwardMessage,
  hideMessage,
  pinMessage,
} from "@/features/message-actions/service";

import { asSuperuser, createTestDb, createUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function insertGroupWithMessage(
  ownerId: string,
  adminId: string,
  memberId: string,
  senderId: string,
): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = randomUUID();
  const messageId = randomUUID();

  await asSuperuser(
    db,
    `insert into public.conversations (id, type, title) values ($1, 'group', 'mods')`,
    [conversationId],
  );

  for (const [userId, role] of [
    [ownerId, "owner"],
    [adminId, "admin"],
    [memberId, "member"],
  ] as const) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, $3)`,
      [conversationId, userId, role],
    );
  }

  await asSuperuser(
    db,
    `insert into public.messages (id, conversation_id, sender_id, client_id, type, body)
     values ($1, $2, $3, $4, 'text', $5)`,
    [messageId, conversationId, senderId, randomUUID(), "group body"],
  );

  return { conversationId, messageId };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("editMessage", () => {
  it("updates within 15 minutes and rejects later edits", async () => {
    const alice = await createUser(db, { username: "ma_edit_alice" });
    const bob = await createUser(db, { username: "ma_edit_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: "ma_edit_bob" });
    if (!opened.ok) throw new Error(opened.error.code);
    const sent = await sendText(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "original",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    const edited = await editMessage(aliceRpc, {
      messageId: sent.value.id,
      body: "fixed",
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.id).toBe(sent.value.id);
    expect(edited.value.body).toBe("fixed");
    expect(edited.value.edited_at).not.toBeNull();

    await asSuperuser(
      db,
      `update public.messages set created_at = now() - interval '20 minutes' where id = $1`,
      [sent.value.id],
    );

    const late = await editMessage(aliceRpc, {
      messageId: sent.value.id,
      body: "too late",
    });
    expect(late).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });

    const bobRpc = createRpcClient(db, bob.id);
    const notSender = await editMessage(bobRpc, {
      messageId: sent.value.id,
      body: "nope",
    });
    expect(notSender).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });
  });
});

describe("hideMessage", () => {
  it("hides only for the caller and is idempotent", async () => {
    const alice = await createUser(db, { username: "ma_hide_alice" });
    const bob = await createUser(db, { username: "ma_hide_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const bobRpc = createRpcClient(db, bob.id);
    const opened = await openDirect(aliceRpc, { username: "ma_hide_bob" });
    if (!opened.ok) throw new Error(opened.error.code);
    const sent = await sendText(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "hide me",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    const first = await hideMessage(bobRpc, { messageId: sent.value.id });
    const second = await hideMessage(bobRpc, { messageId: sent.value.id });
    expect(first.ok && second.ok).toBe(true);

    const bobList = await listMessages(bobRpc, {
      conversationId: opened.value.conversationId,
    });
    const aliceList = await listMessages(aliceRpc, {
      conversationId: opened.value.conversationId,
    });
    if (!bobList.ok || !aliceList.ok) throw new Error("list failed");
    expect(bobList.value.items.some((item) => item.id === sent.value.id)).toBe(
      false,
    );
    expect(aliceList.value.items.some((item) => item.id === sent.value.id)).toBe(
      true,
    );
  });
});

describe("deleteForEveryone", () => {
  it("clears body for everyone and allows group admin moderation", async () => {
    const owner = await createUser(db, { username: "ma_del_owner" });
    const admin = await createUser(db, { username: "ma_del_admin" });
    const member = await createUser(db, { username: "ma_del_member" });
    const adminRpc = createRpcClient(db, admin.id);
    const memberRpc = createRpcClient(db, member.id);

    const group = await insertGroupWithMessage(
      owner.id,
      admin.id,
      member.id,
      member.id,
    );

    await asSuperuser(
      db,
      `update public.messages set created_at = now() - interval '72 hours' where id = $1`,
      [group.messageId],
    );

    const denied = await deleteForEveryone(memberRpc, {
      messageId: group.messageId,
    });
    expect(denied).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });

    const allowed = await deleteForEveryone(adminRpc, {
      messageId: group.messageId,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;

    const lists = await Promise.all([
      listMessages(adminRpc, { conversationId: group.conversationId }),
      listMessages(memberRpc, { conversationId: group.conversationId }),
    ]);
    for (const list of lists) {
      if (!list.ok) throw new Error(list.error.code);
      const row = list.value.items.find((item) => item.id === group.messageId);
      expect(row?.body).toBeNull();
      expect(row?.deletion_scope).toBe("everyone");
    }
  });

  it("allows sender within 48 hours", async () => {
    const alice = await createUser(db, { username: "ma_del_alice" });
    const bob = await createUser(db, { username: "ma_del_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: "ma_del_bob" });
    if (!opened.ok) throw new Error(opened.error.code);
    const sent = await sendText(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "bye",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    const deleted = await deleteForEveryone(aliceRpc, {
      messageId: sent.value.id,
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.body).toBeNull();
    expect(deleted.value.deletion_scope).toBe("everyone");
  });
});

describe("forwardMessage", () => {
  it("creates a forwarded copy without source conversation metadata", async () => {
    const alice = await createUser(db, { username: "ma_fwd_alice" });
    const bob = await createUser(db, { username: "ma_fwd_bob" });
    const carol = await createUser(db, { username: "ma_fwd_carol" });
    const aliceRpc = createRpcClient(db, alice.id);
    const carolRpc = createRpcClient(db, carol.id);

    const ab = await openDirect(aliceRpc, { username: "ma_fwd_bob" });
    const ac = await openDirect(aliceRpc, { username: "ma_fwd_carol" });
    if (!ab.ok || !ac.ok) throw new Error("open failed");

    const sent = await sendText(aliceRpc, {
      conversationId: ab.value.conversationId,
      clientId: randomUUID(),
      body: "share this",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    const forwarded = await forwardMessage(aliceRpc, {
      sourceMessageId: sent.value.id,
      targetConversationId: ac.value.conversationId,
      clientId: randomUUID(),
    });
    expect(forwarded.ok).toBe(true);
    if (!forwarded.ok) return;
    expect(forwarded.value.forwarded).toBe(true);
    expect(forwarded.value.body).toBe("share this");
    expect(forwarded.value.conversation_id).toBe(ac.value.conversationId);
    expect(forwarded.value.metadata).toEqual({});

    const outsider = await forwardMessage(carolRpc, {
      sourceMessageId: sent.value.id,
      targetConversationId: ab.value.conversationId,
      clientId: randomUUID(),
    });
    expect(outsider).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });
  });

  it("refuses forwarding into a direct chat after a block", async () => {
    const alice = await createUser(db, { username: "ma_fwdblk_alice" });
    const bob = await createUser(db, { username: "ma_fwdblk_bob" });
    await createUser(db, { username: "ma_fwdblk_carol" });
    const bobRpc = createRpcClient(db, bob.id);

    const ba = await openDirect(bobRpc, { username: "ma_fwdblk_alice" });
    const bc = await openDirect(bobRpc, { username: "ma_fwdblk_carol" });
    if (!ba.ok || !bc.ok) throw new Error("open failed");

    const source = await sendText(bobRpc, {
      conversationId: bc.value.conversationId,
      clientId: randomUUID(),
      body: "spam",
    });
    if (!source.ok) throw new Error(source.error.code);

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [alice.id, bob.id],
    );

    const forwarded = await forwardMessage(bobRpc, {
      sourceMessageId: source.value.id,
      targetConversationId: ba.value.conversationId,
      clientId: randomUUID(),
    });
    expect(forwarded).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });
  });
});

describe("pinMessage", () => {
  it("allows direct members and rejects group members without role", async () => {
    const alice = await createUser(db, { username: "ma_pin_alice" });
    const bob = await createUser(db, { username: "ma_pin_bob" });
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: "ma_pin_bob" });
    if (!opened.ok) throw new Error(opened.error.code);
    const sent = await sendText(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      body: "pin me",
    });
    if (!sent.ok) throw new Error(sent.error.code);

    const pinned = await pinMessage(aliceRpc, { messageId: sent.value.id });
    expect(pinned.ok).toBe(true);

    const owner = await createUser(db, { username: "ma_pin_owner" });
    const admin = await createUser(db, { username: "ma_pin_admin" });
    const member = await createUser(db, { username: "ma_pin_member" });
    const memberRpc = createRpcClient(db, member.id);
    const group = await insertGroupWithMessage(
      owner.id,
      admin.id,
      member.id,
      member.id,
    );

    const denied = await pinMessage(memberRpc, { messageId: group.messageId });
    expect(denied).toEqual({
      ok: false,
      error: { code: "message_actions.not_allowed" },
    });
  });
});

describe("reply via sendText", () => {
  it("rejects reply targets from another conversation", async () => {
    const alice = await createUser(db, { username: "ma_rep_alice" });
    const bob = await createUser(db, { username: "ma_rep_bob" });
    const carol = await createUser(db, { username: "ma_rep_carol" });
    const aliceRpc = createRpcClient(db, alice.id);

    const ab = await openDirect(aliceRpc, { username: "ma_rep_bob" });
    const ac = await openDirect(aliceRpc, { username: "ma_rep_carol" });
    if (!ab.ok || !ac.ok) throw new Error("open failed");

    const foreign = await sendText(aliceRpc, {
      conversationId: ab.value.conversationId,
      clientId: randomUUID(),
      body: "foreign",
    });
    if (!foreign.ok) throw new Error(foreign.error.code);

    const reply = await sendText(aliceRpc, {
      conversationId: ac.value.conversationId,
      clientId: randomUUID(),
      body: "wrong quote",
      replyToId: foreign.value.id,
    });
    expect(reply).toEqual({
      ok: false,
      error: { code: "messaging.reply_not_found" },
    });
  });
});
