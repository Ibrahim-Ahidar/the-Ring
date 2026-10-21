import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirect, sendText } from "@/features/direct-messaging/service";
import {
  addReaction,
  listReactions,
  removeReaction,
} from "@/features/reactions/service";
import { ALLOWED_REACTION_EMOJI } from "@/features/reactions/types";

import { asSuperuser, createTestDb, createUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function openPair(usernames: [string, string]) {
  const alice = await createUser(db, { username: usernames[0] });
  const bob = await createUser(db, { username: usernames[1] });
  const aliceRpc = createRpcClient(db, alice.id);
  const opened = await openDirect(aliceRpc, { username: usernames[1] });
  if (!opened.ok) {
    throw new Error("open failed");
  }
  return { alice, bob, aliceRpc, bobRpc: createRpcClient(db, bob.id), conversationId: opened.value.conversationId };
}

describe("reactions RPC", () => {
  it("adds a reaction visible to the other member", async () => {
    const { alice, aliceRpc, bobRpc, conversationId } = await openPair([
      "rx_a1",
      "rx_b1",
    ]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "hello",
    });
    if (!sent.ok) throw new Error("send failed");

    const added = await addReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(added.ok).toBe(true);

    const listed = await listReactions(bobRpc, {
      conversationId,
      messageIds: [sent.value.id],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.user_id).toBe(alice.id);
  });

  it("refuses reactions in a direct chat after a block", async () => {
    const { alice, bob, aliceRpc, bobRpc, conversationId } = await openPair([
      "rx_blk_a",
      "rx_blk_b",
    ]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "before the block",
    });
    if (!sent.ok) throw new Error("send failed");

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [alice.id, bob.id],
    );

    const added = await addReaction(bobRpc, {
      messageId: sent.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(added).toEqual({ ok: false, error: { code: "reactions.not_allowed" } });
  });

  it("rejects non-members", async () => {
    const { aliceRpc, conversationId } = await openPair(["rx_a2", "rx_b2"]);
    const outsider = await createUser(db, { username: "rx_out2" });
    const outsiderRpc = createRpcClient(db, outsider.id);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "secret",
    });
    if (!sent.ok) throw new Error("send failed");

    const denied = await addReaction(outsiderRpc, {
      messageId: sent.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(denied).toEqual({
      ok: false,
      error: { code: "messaging.not_member" },
    });
  });

  it("is idempotent on duplicate add", async () => {
    const { alice, aliceRpc, conversationId } = await openPair(["rx_a3", "rx_b3"]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "dup",
    });
    if (!sent.ok) throw new Error("send failed");
    const emoji = ALLOWED_REACTION_EMOJI[1];

    const first = await addReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji,
    });
    const second = await addReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji,
    });
    expect(first.ok && second.ok).toBe(true);

    const rows = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.message_reactions
       where message_id = $1 and user_id = $2 and emoji = $3`,
      [sent.value.id, alice.id, emoji],
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);

    const listed = await listReactions(aliceRpc, {
      conversationId,
      messageIds: [sent.value.id],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.filter((r) => r.emoji === emoji)).toHaveLength(1);
  });

  it("remove then list is empty for that emoji", async () => {
    const { aliceRpc, conversationId } = await openPair(["rx_a4", "rx_b4"]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "rm",
    });
    if (!sent.ok) throw new Error("send failed");
    const emoji = ALLOWED_REACTION_EMOJI[2];

    await addReaction(aliceRpc, { messageId: sent.value.id, emoji });
    const removed = await removeReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji,
    });
    expect(removed.ok).toBe(true);

    const listed = await listReactions(aliceRpc, {
      conversationId,
      messageIds: [sent.value.id],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(0);
  });

  it("rejects invalid emoji", async () => {
    const { aliceRpc, conversationId } = await openPair(["rx_a5", "rx_b5"]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "x",
    });
    if (!sent.ok) throw new Error("send failed");

    const bad = await addReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji: "🔥",
    });
    expect(bad).toEqual({
      ok: false,
      error: { code: "reactions.invalid_emoji" },
    });
  });

  it("refuses deleted-for-everyone and hidden-for-actor", async () => {
    const { bob, aliceRpc, bobRpc, conversationId } = await openPair([
      "rx_a6",
      "rx_b6",
    ]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "gone",
    });
    if (!sent.ok) throw new Error("send failed");

    await asSuperuser(
      db,
      `update public.messages
       set deletion_scope = 'everyone', body = null, deleted_at = now()
       where id = $1`,
      [sent.value.id],
    );

    const tomb = await addReaction(bobRpc, {
      messageId: sent.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(tomb).toEqual({
      ok: false,
      error: { code: "reactions.not_allowed" },
    });

    const sent2 = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "hide me",
    });
    if (!sent2.ok) throw new Error("send failed");

    await asSuperuser(
      db,
      `insert into public.message_hides (message_id, user_id) values ($1, $2)`,
      [sent2.value.id, bob.id],
    );

    const hidden = await addReaction(bobRpc, {
      messageId: sent2.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(hidden).toEqual({
      ok: false,
      error: { code: "reactions.not_allowed" },
    });

    const peerOk = await addReaction(aliceRpc, {
      messageId: sent2.value.id,
      emoji: ALLOWED_REACTION_EMOJI[0],
    });
    expect(peerOk.ok).toBe(true);
  });

  it("does not change last_message_at and notifies the peer on add", async () => {
    const { alice, bob, aliceRpc, conversationId } = await openPair([
      "rx_a7",
      "rx_b7",
    ]);
    const sent = await sendText(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "notify",
    });
    if (!sent.ok) throw new Error("send failed");

    const before = await asSuperuser<{ rows: { last_message_at: string }[] }>(
      db,
      `select last_message_at::text from public.conversations where id = $1`,
      [conversationId],
    );

    const added = await addReaction(aliceRpc, {
      messageId: sent.value.id,
      emoji: ALLOWED_REACTION_EMOJI[3],
    });
    expect(added.ok).toBe(true);

    const after = await asSuperuser<{ rows: { last_message_at: string }[] }>(
      db,
      `select last_message_at::text from public.conversations where id = $1`,
      [conversationId],
    );
    expect(after.rows[0]?.last_message_at).toBe(before.rows[0]?.last_message_at);

    const notes = await asSuperuser<{ rows: { type: string; recipient_id: string }[] }>(
      db,
      `select type, recipient_id::text from public.notifications
       where entity_id = $1 and type = 'reaction.created'`,
      [sent.value.id],
    );
    expect(notes.rows.some((row) => row.recipient_id === bob.id)).toBe(true);
    expect(notes.rows.some((row) => row.recipient_id === alice.id)).toBe(false);
  });
});
