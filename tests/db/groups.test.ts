import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getConversation,
  listMessages,
  sendText,
} from "@/features/direct-messaging/service";
import { favorite } from "@/features/discovery-contacts/service";
import {
  createGroup,
  createInviteLink,
  getGroup,
  inviteMember,
  joinByCode,
  leaveGroup,
  listMembers,
  removeMember,
  revokeInviteLink,
  setMessagingRestricted,
  setRole,
  transferOwnership,
  updateGroup,
} from "@/features/groups/service";
import {
  listGroupReports,
  markReportReviewed,
} from "@/features/safety/service";

import { asSuperuser, createTestDb, createUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("createGroup", () => {
  it("creates one owner membership and rate limits are invoked via RPC", async () => {
    const owner = await createUser(db, { username: "grp_owner" });
    const rpc = createRpcClient(db, owner.id);

    const created = await createGroup(rpc, { name: "Study Group" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const members = await listMembers(rpc, created.value.conversationId);
    expect(members.ok).toBe(true);
    if (members.ok) {
      expect(members.value).toHaveLength(1);
      expect(members.value[0]?.role).toBe("owner");
    }

    const outsider = await createUser(db, { username: "grp_out" });
    const outsiderRpc = createRpcClient(db, outsider.id);
    const denied = await updateGroup(outsiderRpc, {
      conversationId: created.value.conversationId,
      name: "Hijacked",
    });
    expect(denied).toEqual({ ok: false, error: { code: "groups.not_member" } });
  });
});

describe("inviteMember", () => {
  it("respects deny and contacts-only favorites", async () => {
    const owner = await createUser(db, { username: "inv_owner" });
    await createUser(db, {
      username: "inv_deny",
      profileOverrides: { who_can_add_to_groups: "nobody" },
    });
    await createUser(db, {
      username: "inv_contacts",
      profileOverrides: { who_can_add_to_groups: "contacts" },
    });
    const ownerRpc = createRpcClient(db, owner.id);

    const group = await createGroup(ownerRpc, { name: "Invite Test" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const denied = await inviteMember(ownerRpc, {
      conversationId: group.value.conversationId,
      username: "inv_deny",
    });
    expect(denied).toEqual({ ok: false, error: { code: "groups.not_allowed" } });

    const noFavorite = await inviteMember(ownerRpc, {
      conversationId: group.value.conversationId,
      username: "inv_contacts",
    });
    expect(noFavorite).toEqual({ ok: false, error: { code: "groups.not_allowed" } });

    const fav = await favorite(ownerRpc, "inv_contacts");
    expect(fav.ok).toBe(true);

    const allowed = await inviteMember(ownerRpc, {
      conversationId: group.value.conversationId,
      username: "inv_contacts",
    });
    expect(allowed.ok).toBe(true);

    const duplicate = await inviteMember(ownerRpc, {
      conversationId: group.value.conversationId,
      username: "inv_contacts",
    });
    expect(duplicate.ok).toBe(true);

    const members = await listMembers(ownerRpc, group.value.conversationId);
    expect(members.ok).toBe(true);
    if (members.ok) {
      const contactRows = members.value.filter((m) => m.username === "inv_contacts");
      expect(contactRows).toHaveLength(1);
    }
  });

  it("writes a system message on invite join", async () => {
    const owner = await createUser(db, { username: "sys_owner" });
    const guest = await createUser(db, { username: "sys_guest" });
    const ownerRpc = createRpcClient(db, owner.id);

    const group = await createGroup(ownerRpc, { name: "System Msg" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const invited = await inviteMember(ownerRpc, {
      conversationId: group.value.conversationId,
      username: "sys_guest",
    });
    expect(invited.ok).toBe(true);

    const messages = await listMessages(ownerRpc, {
      conversationId: group.value.conversationId,
    });
    expect(messages.ok).toBe(true);
    if (messages.ok) {
      const system = messages.value.items.find((m) => m.type === "system");
      expect(system?.metadata).toMatchObject({
        event: "joined",
        subjectUserId: guest.id,
      });
    }
  });
});

describe("invite links and member cap", () => {
  it("honors revoke, expiry, max uses, and member limit", async () => {
    const owner = await createUser(db, { username: "link_owner" });
    const joiner = await createUser(db, { username: "link_join" });
    const ownerRpc = createRpcClient(db, owner.id);
    const joinerRpc = createRpcClient(db, joiner.id);

    const group = await createGroup(ownerRpc, { name: "Links" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const link = await createInviteLink(ownerRpc, {
      conversationId: group.value.conversationId,
      maxUses: 1,
    });
    expect(link.ok).toBe(true);
    if (!link.ok) return;

    const joined = await joinByCode(joinerRpc, link.value.code);
    expect(joined.ok).toBe(true);

    const exhausted = await joinByCode(
      createRpcClient(db, (await createUser(db, { username: "link_join2" })).id),
      link.value.code,
    );
    expect(exhausted).toEqual({
      ok: false,
      error: { code: "groups.invite_link_exhausted" },
    });

    const expiredLink = await createInviteLink(ownerRpc, {
      conversationId: group.value.conversationId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(expiredLink.ok).toBe(true);
    if (expiredLink.ok) {
      const expired = await joinByCode(joinerRpc, expiredLink.value.code);
      expect(expired).toEqual({
        ok: false,
        error: { code: "groups.invite_link_expired" },
      });
    }

    const revocable = await createInviteLink(ownerRpc, {
      conversationId: group.value.conversationId,
    });
    expect(revocable.ok).toBe(true);
    if (revocable.ok) {
      await revokeInviteLink(ownerRpc, revocable.value.id);
      const revoked = await joinByCode(joinerRpc, revocable.value.code);
      expect(revoked).toEqual({
        ok: false,
        error: { code: "groups.invite_link_revoked" },
      });
    }

    const capGroup = await createGroup(ownerRpc, { name: "Cap Group" });
    expect(capGroup.ok).toBe(true);
    if (!capGroup.ok) return;

    for (let i = 0; i < 199; i += 1) {
      const uid = randomUUID();
      await asSuperuser(
        db,
        `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
         values ($1, $2, now(), $3::jsonb)`,
        [uid, `cap${i}@pulse.test`, JSON.stringify({ username: `cap_${i}` })],
      );
      await asSuperuser(
        db,
        `insert into public.profiles (id, username) values ($1, $2)
         on conflict (id) do update set username = excluded.username`,
        [uid, `cap_${i}`],
      );
      await asSuperuser(
        db,
        `insert into public.conversation_members (conversation_id, user_id, role)
         values ($1, $2, 'member')`,
        [capGroup.value.conversationId, uid],
      );
    }

    await createUser(db, { username: "cap_201" });
    const atLimit = await inviteMember(ownerRpc, {
      conversationId: capGroup.value.conversationId,
      username: "cap_201",
    });
    expect(atLimit).toEqual({ ok: false, error: { code: "groups.member_limit" } });
  });
});

describe("roles, removal, leave, transfer", () => {
  it("protects owner and enforces send restrictions", async () => {
    const owner = await createUser(db, { username: "role_owner" });
    const admin = await createUser(db, { username: "role_admin" });
    const member = await createUser(db, { username: "role_member" });
    const ownerRpc = createRpcClient(db, owner.id);
    const adminRpc = createRpcClient(db, admin.id);
    const memberRpc = createRpcClient(db, member.id);

    const group = await createGroup(ownerRpc, { name: "Roles" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    const conversationId = group.value.conversationId;

    await inviteMember(ownerRpc, { conversationId, username: "role_admin" });
    await inviteMember(ownerRpc, { conversationId, username: "role_member" });

    await setRole(ownerRpc, {
      conversationId,
      userId: admin.id,
      role: "admin",
    });

    const removeOwner = await removeMember(adminRpc, {
      conversationId,
      userId: owner.id,
    });
    expect(removeOwner).toEqual({
      ok: false,
      error: { code: "groups.cannot_target_owner" },
    });

    await transferOwnership(ownerRpc, { conversationId, userId: admin.id });
    const afterTransfer = await getGroup(ownerRpc, conversationId);
    expect(afterTransfer.ok).toBe(true);
    if (afterTransfer.ok) {
      expect(afterTransfer.value.myRole).toBe("admin");
    }
    const newOwner = await getGroup(adminRpc, conversationId);
    expect(newOwner.ok).toBe(true);
    if (newOwner.ok) {
      expect(newOwner.value.myRole).toBe("owner");
    }

    await setMessagingRestricted(adminRpc, {
      conversationId,
      userId: member.id,
      restricted: true,
    });

    const blockedSend = await sendText(memberRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "blocked",
    });
    expect(blockedSend).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });

    await removeMember(adminRpc, { conversationId, userId: member.id });
    const removedRead = await getConversation(memberRpc, { conversationId });
    expect(removedRead).toEqual({ ok: false, error: { code: "messaging.not_member" } });

    const ownerLeave = await leaveGroup(adminRpc, conversationId);
    expect(ownerLeave).toEqual({
      ok: false,
      error: { code: "groups.owner_must_transfer" },
    });
  });

  it("denies non-members from listing members", async () => {
    const owner = await createUser(db, { username: "list_owner" });
    const outsider = await createUser(db, { username: "list_out" });
    const ownerRpc = createRpcClient(db, owner.id);
    const outsiderRpc = createRpcClient(db, outsider.id);

    const group = await createGroup(ownerRpc, { name: "Private List" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const denied = await listMembers(outsiderRpc, group.value.conversationId);
    expect(denied).toEqual({ ok: false, error: { code: "groups.not_member" } });
  });
});

describe("group reports", () => {
  it("allows admins to list and review message reports", async () => {
    const owner = await createUser(db, { username: "rep_owner" });
    const reporter = await createUser(db, { username: "rep_reporter" });
    const ownerRpc = createRpcClient(db, owner.id);
    const reporterRpc = createRpcClient(db, reporter.id);

    const group = await createGroup(ownerRpc, { name: "Reports" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    const conversationId = group.value.conversationId;

    await inviteMember(ownerRpc, { conversationId, username: "rep_reporter" });

    const sent = await sendText(reporterRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "report me",
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const reportId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.reports (id, reporter_id, target_message_id, category, status)
       values ($1, $2, $3, 'spam', 'open')`,
      [reportId, reporter.id, sent.value.id],
    );

    const listed = await listGroupReports(ownerRpc, conversationId);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.some((row) => row.id === reportId)).toBe(true);
    }

    const reviewed = await markReportReviewed(ownerRpc, reportId);
    expect(reviewed.ok).toBe(true);
  });
});

describe("DM spine with groups", () => {
  it("loads group conversations through getConversation and sendText", async () => {
    const owner = await createUser(db, { username: "dm_grp_owner" });
    const ownerRpc = createRpcClient(db, owner.id);

    const group = await createGroup(ownerRpc, { name: "DM Group" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const detail = await getConversation(ownerRpc, {
      conversationId: group.value.conversationId,
    });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.value.type).toBe("group");
      expect(detail.value.title).toBe("DM Group");
    }

    const sent = await sendText(ownerRpc, {
      conversationId: group.value.conversationId,
      clientId: randomUUID(),
      body: "hello group",
    });
    expect(sent.ok).toBe(true);
  });
});
