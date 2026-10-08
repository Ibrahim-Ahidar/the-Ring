import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchByUsername } from "@/features/discovery-contacts/service";
import { openDirect, sendText } from "@/features/direct-messaging/service";
import { searchConversation, searchGlobal } from "@/features/search/service";
import { RATE_LIMITS } from "@/platform/limit";

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

async function insertGroup(
  memberIds: string[],
  title: string,
): Promise<string> {
  const groupId = randomUUID();
  await asSuperuser(
    db,
    `insert into public.conversations (id, type, title) values ($1, 'group', $2)`,
    [groupId, title],
  );
  for (const userId of memberIds) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [groupId, userId],
    );
  }
  return groupId;
}

describe("searchGlobal messages", () => {
  it("finds a member message and hides it from non-members", async () => {
    const alice = await createUser(db, { username: "srch_alice" });
    await createUser(db, { username: "srch_bob" });
    const outsider = await createUser(db, { username: "srch_out" });

    const aliceRpc = createRpcClient(db, alice.id);
    const open = await openDirect(aliceRpc, { username: "srch_bob" });
    expect(open.ok).toBe(true);
    if (!open.ok) return;

    const sent = await sendText(aliceRpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body: "unique findable needle token",
    });
    expect(sent.ok).toBe(true);

    const memberHit = await searchGlobal(aliceRpc, { query: "needle" });
    expect(memberHit.ok).toBe(true);
    if (!memberHit.ok) return;
    expect(memberHit.value.messages.some((m) => m.snippet.includes("needle"))).toBe(
      true,
    );

    const outsiderRpc = createRpcClient(db, outsider.id);
    const leaked = await searchGlobal(outsiderRpc, { query: "needle" });
    expect(leaked.ok).toBe(true);
    if (!leaked.ok) return;
    expect(leaked.value.messages).toHaveLength(0);
  });

  it("excludes deleted-for-everyone, hidden, and pending-upload messages", async () => {
    const alice = await createUser(db, { username: "srch_hide_a" });
    await createUser(db, { username: "srch_hide_b" });
    const aliceRpc = createRpcClient(db, alice.id);
    const open = await openDirect(aliceRpc, { username: "srch_hide_b" });
    if (!open.ok) return;

    const visible = await sendText(aliceRpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body: "visible token alpha",
    });
    expect(visible.ok).toBe(true);

    const deleted = await sendText(aliceRpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body: "deleted token beta",
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    await asSuperuser(
      db,
      `update public.messages
       set deletion_scope = 'everyone', body = null, metadata = '{}'::jsonb
       where id = $1`,
      [deleted.value.id],
    );

    const hidden = await sendText(aliceRpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body: "hidden token gamma",
    });
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;

    await asSuperuser(
      db,
      `insert into public.message_hides (message_id, user_id) values ($1, $2)`,
      [hidden.value.id, alice.id],
    );

    const pendingId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.messages (
         id, conversation_id, sender_id, client_id, type, body, metadata
       ) values ($1, $2, $3, $4, 'text', $5, $6::jsonb)`,
      [
        pendingId,
        open.value.conversationId,
        alice.id,
        randomUUID(),
        "pending token delta",
        JSON.stringify({ upload: "pending" }),
      ],
    );

    const result = await searchGlobal(aliceRpc, { query: "token" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snippets = result.value.messages.map((m) => m.snippet).join(" ");
    expect(snippets).toContain("alpha");
    expect(snippets).not.toContain("beta");
    expect(snippets).not.toContain("gamma");
    expect(snippets).not.toContain("delta");
  });

  it("returns no message rows for a one-character query", async () => {
    const alice = await createUser(db, { username: "srch_one_a" });
    await createUser(db, { username: "srch_one_b" });
    const rpc = createRpcClient(db, alice.id);
    const open = await openDirect(rpc, { username: "srch_one_b" });
    if (!open.ok) return;
    await sendText(rpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body: "xylophone",
    });

    const result = await searchGlobal(rpc, { query: "x" });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ messages: [] }),
    });
  });

  it("paginates message results", async () => {
    const alice = await createUser(db, { username: "srch_page_a" });
    await createUser(db, { username: "srch_page_b" });
    const rpc = createRpcClient(db, alice.id);
    const open = await openDirect(rpc, { username: "srch_page_b" });
    if (!open.ok) return;

    for (let i = 0; i < 25; i++) {
      await sendText(rpc, {
        conversationId: open.value.conversationId,
        clientId: randomUUID(),
        body: `paginate word ${i}`,
      });
    }

    const first = await searchGlobal(rpc, { query: "paginate" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.messages).toHaveLength(20);
    expect(first.value.messagesHasMore).toBe(true);
    expect(first.value.nextMessageCursor).toBeTruthy();

    const second = await searchGlobal(rpc, {
      query: "paginate",
      cursor: first.value.nextMessageCursor,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.messages.length).toBeGreaterThan(0);
    expect(second.value.messages.length).toBeLessThanOrEqual(20);
  });

  it("snippet stays within the message haystack", async () => {
    const alice = await createUser(db, { username: "srch_snip_a" });
    await createUser(db, { username: "srch_snip_b" });
    const rpc = createRpcClient(db, alice.id);
    const open = await openDirect(rpc, { username: "srch_snip_b" });
    if (!open.ok) return;

    const body = "before MATCHWORD after";
    await sendText(rpc, {
      conversationId: open.value.conversationId,
      clientId: randomUUID(),
      body,
    });

    const result = await searchGlobal(rpc, { query: "MATCH" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hit = result.value.messages[0];
    expect(hit).toBeTruthy();
    expect(body.includes(hit!.snippet)).toBe(true);
  });
});

describe("searchGlobal conversations", () => {
  it("matches group title for members only", async () => {
    const member = await createUser(db, { username: "srch_grp_mem" });
    const outsider = await createUser(db, { username: "srch_grp_out" });
    await insertGroup([member.id], "UniqueGroupTitleXYZ");

    const memberRpc = createRpcClient(db, member.id);
    const hit = await searchGlobal(memberRpc, { query: "UniqueGroup" });
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.value.conversations.some((c) => c.title?.includes("UniqueGroup"))).toBe(
      true,
    );

    const outRpc = createRpcClient(db, outsider.id);
    const miss = await searchGlobal(outRpc, { query: "UniqueGroup" });
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(miss.value.conversations).toHaveLength(0);
  });
});

describe("searchGlobal people", () => {
  it("returns null person for a blocked username via discovery", async () => {
    const actor = await createUser(db, { username: "srch_people_actor" });
    const target = await createUser(db, {
      username: "srch_people_tgt",
      profileOverrides: { discoverable: false },
    });
    const rpc = createRpcClient(db, actor.id);

    const personOnly = await searchByUsername(rpc, target.username);
    expect(personOnly.ok).toBe(true);
    if (!personOnly.ok) return;
    expect(personOnly.value).toBeNull();

    const global = await searchGlobal(rpc, { query: target.username });
    expect(global.ok).toBe(true);
    if (!global.ok) return;
    expect(global.value.person).toBeNull();
  });
});

describe("search rate limit", () => {
  it("returns platform.rate_limited when over cap", async () => {
    const actor = await createUser(db, { username: `srch_rate_${randomUUID().slice(0, 8)}` });
    const rpc = createRpcClient(db, actor.id);
    await asSuperuser(
      db,
      `delete from public.rate_limit_counters where user_id = $1 and action = 'search_users'`,
      [actor.id],
    );

    for (let i = 0; i < RATE_LIMITS.search_users.max; i++) {
      const result = await searchGlobal(rpc, { query: `rate-limit-${i}` });
      expect(result.ok).toBe(true);
    }

    const blocked = await searchGlobal(rpc, { query: "rate-limit-blocked" });
    expect(blocked).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});

describe("searchConversation", () => {
  it("scopes results to the open conversation", async () => {
    const alice = await createUser(db, { username: "srch_conv_a" });
    await createUser(db, { username: "srch_conv_b" });
    const rpc = createRpcClient(db, alice.id);

    const direct = await openDirect(rpc, { username: "srch_conv_b" });
    if (!direct.ok) return;

    const otherGroup = await insertGroup([alice.id], "Other");
    await sendText(rpc, {
      conversationId: direct.value.conversationId,
      clientId: randomUUID(),
      body: "in direct chat keyword",
    });
    await sendText(rpc, {
      conversationId: otherGroup,
      clientId: randomUUID(),
      body: "in group chat keyword",
    });

    const inThread = await searchConversation(rpc, {
      conversationId: direct.value.conversationId,
      query: "keyword",
    });
    expect(inThread.ok).toBe(true);
    if (!inThread.ok) return;
    expect(inThread.value.messages.every((m) => m.conversationId === direct.value.conversationId)).toBe(
      true,
    );
    expect(inThread.value.messages.some((m) => m.snippet.includes("direct"))).toBe(
      true,
    );
    expect(inThread.value.messages.some((m) => m.snippet.includes("group"))).toBe(
      false,
    );
  });
});
