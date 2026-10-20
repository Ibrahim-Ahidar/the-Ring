import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  blockUser,
  decideInteraction,
  getPrivacy,
  listGroupReports,
  listMyReports,
  markReportReviewed,
  reportMessage,
  reportUser,
  unblockUser,
  updatePrivacy,
} from "@/features/safety/service";

import { asSuperuser, asUser, createTestDb, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createSafetyUser(
  username: string,
  profileOverrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = `${username}@pulse.test`;

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify({ username })],
  );

  if (Object.keys(profileOverrides).length > 0) {
    const sets = Object.keys(profileOverrides).map(
      (key, index) => `${key} = $${index + 2}`,
    );
    await asSuperuser(
      db,
      `update public.profiles set ${sets.join(", ")} where id = $1`,
      [id, ...Object.values(profileOverrides)],
    );
  }

  return { id, username };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function insertDirectMessage(
  memberIds: string[],
  body: string,
): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const senderId = memberIds[0]!;

  await asSuperuser(
    db,
    `insert into public.conversations (id, type) values ($1, 'direct')`,
    [conversationId],
  );

  for (const userId of memberIds) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [conversationId, userId],
    );
  }

  await asSuperuser(
    db,
    `insert into public.messages (id, conversation_id, sender_id, client_id, type, body)
     values ($1, $2, $3, $4, 'text', $5)`,
    [messageId, conversationId, senderId, randomUUID(), body],
  );

  return { conversationId, messageId };
}

async function insertGroupWithMessage(
  ownerId: string,
  adminId: string,
  memberId: string,
): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = randomUUID();
  const messageId = randomUUID();

  await asSuperuser(
    db,
    `insert into public.conversations (id, type, title) values ($1, 'group', 'mod')`,
    [conversationId],
  );

  const roles: Array<[string, string]> = [
    [ownerId, "owner"],
    [adminId, "admin"],
    [memberId, "member"],
  ];
  for (const [userId, role] of roles) {
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
    [messageId, conversationId, memberId, randomUUID(), "group msg"],
  );

  return { conversationId, messageId };
}

describe("privacy settings", () => {
  it("round-trips each column and rejects invalid values", async () => {
    const owner = await createSafetyUser("priv_owner");
    const rpc = createRpcClient(db, owner.id);

    const initial = await getPrivacy(rpc);
    expect(initial.ok).toBe(true);

    const updated = await updatePrivacy(rpc, { discoverable: false });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.discoverable).toBe(false);
    }

    const bad = await updatePrivacy(rpc, {});
    expect(bad).toEqual({ ok: false, error: { code: "safety.invalid_setting" } });

    const badEnum = await updatePrivacy(rpc, {
      whoCanMessage: "not-a-choice" as "everyone",
    });
    expect(badEnum).toEqual({ ok: false, error: { code: "safety.invalid_setting" } });

    const vis = await updatePrivacy(rpc, { profileVisibility: "private" });
    expect(vis.ok).toBe(true);

    const msg = await updatePrivacy(rpc, { whoCanMessage: "nobody" });
    expect(msg.ok).toBe(true);

    const groups = await updatePrivacy(rpc, { whoCanAddToGroups: "contacts" });
    expect(groups.ok).toBe(true);

    const presence = await updatePrivacy(rpc, {
      showOnline: false,
      showLastSeen: false,
      sendReadReceipts: false,
    });
    expect(presence.ok).toBe(true);
  });

  it("denies a second user from updating the first user's privacy", async () => {
    const owner = await createSafetyUser("priv_a");
    const other = await createSafetyUser("priv_b");
    const otherRpc = createRpcClient(db, other.id);

    const attempt = await updatePrivacy(otherRpc, { discoverable: false });
    expect(attempt.ok).toBe(true);
    if (attempt.ok) {
      expect(attempt.value.discoverable).toBe(false);
    }

    const ownerRows = await asUser<{ rows: { discoverable: boolean }[] }>(
      db,
      owner.id,
      `select discoverable from public.profiles where id = $1`,
      [owner.id],
    );
    expect(ownerRows.rows[0]?.discoverable).toBe(true);
  });

  it("changes decideInteraction when settings change", async () => {
    const actor = await createSafetyUser("di_actor");
    const target = await createSafetyUser("di_target", {
      discoverable: true,
      profile_visibility: "public",
      who_can_message: "everyone",
      show_online: true,
    });
    const targetRpc = createRpcClient(db, target.id);

    const msgSetting = await updatePrivacy(targetRpc, { whoCanMessage: "requests" });
    expect(msgSetting.ok).toBe(true);
    if (msgSetting.ok) {
      expect(msgSetting.value.whoCanMessage).toBe("requests");
    }
    let decision = await decideInteraction(
      createRpcClient(db, actor.id),
      actor.id,
      target.id,
      "message",
    );
    expect(decision).toEqual({ ok: true, value: "request" });

    await updatePrivacy(targetRpc, { discoverable: false });
    decision = await decideInteraction(
      createRpcClient(db, actor.id),
      actor.id,
      target.id,
      "discover",
    );
    expect(decision).toEqual({ ok: true, value: "deny" });
  });
});

describe("blocks", () => {
  it("is idempotent and refuses self and unknown users", async () => {
    const blocker = await createSafetyUser("blk_me");
    const blocked = await createSafetyUser("blk_them");
    const rpc = createRpcClient(db, blocker.id);

    const first = await blockUser(rpc, blocked.id);
    const second = await blockUser(rpc, blocked.id);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const rows = await asUser<{ rows: unknown[] }>(
      db,
      blocker.id,
      `select blocked_id from public.blocks where blocker_id = $1`,
      [blocker.id],
    );
    expect(rows.rows).toHaveLength(1);

    const self = await blockUser(rpc, blocker.id);
    expect(self).toEqual({ ok: false, error: { code: "safety.cannot_block_self" } });

    const missing = await blockUser(rpc, randomUUID());
    expect(missing).toEqual({ ok: false, error: { code: "safety.not_found" } });
  });

  it("denies every action both ways until unblock", async () => {
    const a = await createSafetyUser("blk_a2");
    const b = await createSafetyUser("blk_b2");
    const rpcA = createRpcClient(db, a.id);

    await blockUser(rpcA, b.id);

    for (const actor of [a.id, b.id]) {
      for (const target of [a.id, b.id]) {
        if (actor === target) {
          continue;
        }
        for (const action of ["discover", "message", "invite", "presence"] as const) {
          const result = await decideInteraction(
            createRpcClient(db, actor),
            actor,
            target,
            action,
          );
          expect(result).toEqual({ ok: true, value: "deny" });
        }
      }
    }

    await unblockUser(rpcA, b.id);
    const restored = await decideInteraction(
      createRpcClient(db, a.id),
      a.id,
      b.id,
      "message",
    );
    expect(restored).toEqual({ ok: true, value: "allow" });
  });
});

describe("reports", () => {
  it("requires membership for message reports and hides from strangers", async () => {
    const reporter = await createSafetyUser("rep_a");
    const member = await createSafetyUser("rep_b");
    const outsider = await createSafetyUser("rep_out");
    const { messageId } = await insertDirectMessage([member.id, reporter.id], "hi");

    const denied = await reportMessage(createRpcClient(db, outsider.id), {
      targetMessageId: messageId,
      category: "spam",
    });
    expect(denied).toEqual({ ok: false, error: { code: "safety.not_found" } });

    const ok = await reportMessage(createRpcClient(db, reporter.id), {
      targetMessageId: messageId,
      category: "harassment",
      details: "note",
    });
    expect(ok.ok).toBe(true);

    const mine = await listMyReports(createRpcClient(db, reporter.id));
    expect(mine.ok).toBe(true);
    if (mine.ok) {
      expect(mine.value).toHaveLength(1);
    }

    const strangerList = await asUser<{ rows: unknown[] }>(
      db,
      outsider.id,
      `select id from public.reports`,
    );
    expect(strangerList.rows).toHaveLength(0);
  });

  it("rate limits the sixth report in an hour", async () => {
    const reporter = await createSafetyUser("rep_lim");
    const target = await createSafetyUser("rep_tgt");
    const rpc = createRpcClient(db, reporter.id);

    for (let i = 0; i < 5; i++) {
      const result = await reportUser(rpc, {
        targetUserId: target.id,
        category: "other",
        details: `r${i}`,
      });
      expect(result.ok).toBe(true);
    }

    const blocked = await reportUser(rpc, {
      targetUserId: target.id,
      category: "spam",
    });
    expect(blocked).toEqual({ ok: false, error: { code: "platform.rate_limited" } });
  });

  it("lets group admins list and review message reports", async () => {
    const owner = await createSafetyUser("grp_own");
    const admin = await createSafetyUser("grp_adm");
    const member = await createSafetyUser("grp_mem");
    const { conversationId, messageId } = await insertGroupWithMessage(
      owner.id,
      admin.id,
      member.id,
    );

    const submit = await reportMessage(createRpcClient(db, member.id), {
      targetMessageId: messageId,
      category: "spam",
    });
    expect(submit.ok).toBe(true);

    const adminList = await listGroupReports(
      createRpcClient(db, admin.id),
      conversationId,
    );
    expect(adminList.ok).toBe(true);
    if (adminList.ok) {
      expect(adminList.value).toHaveLength(1);
    }

    const reportId = adminList.ok ? adminList.value[0]!.id : "";
    const reviewed = await markReportReviewed(
      createRpcClient(db, admin.id),
      reportId,
    );
    expect(reviewed).toEqual({ ok: true, value: "reviewed" });
  });
});
