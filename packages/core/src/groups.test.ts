import { describe, expect, it, vi } from "vitest";

import { createGroup, leaveGroup, listMembers, removeMember } from "./groups";
import type { RpcClient } from "./rpc";

function client(handler: (fn: string, args?: Record<string, unknown>) => { data?: unknown; error?: string }) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const r = handler(fn, args);
    return { data: r.data ?? null, error: r.error ? { message: r.error } : null };
  });
  return { rpc } as RpcClient & { rpc: typeof rpc };
}

describe("createGroup", () => {
  it("creates the group then invites each parsed username", async () => {
    const c = client((fn) => (fn === "groups_create" ? { data: "g1" } : {}));
    const r = await createGroup(c, { name: "Team", members: "@ann, bob ann" });
    expect(r).toEqual({ ok: true, value: { conversationId: "g1", failedInvites: [] } });
    expect(c.rpc.mock.calls.map((x) => x[0])).toEqual([
      "groups_create",
      "groups_invite_member",
      "groups_invite_member",
    ]);
    expect(c.rpc.mock.calls[1]?.[1]).toMatchObject({ p_conversation_id: "g1", p_username: "ann" });
  });

  it("keeps the group and reports failed invites", async () => {
    const c = client((fn, a) =>
      fn === "groups_create"
        ? { data: "g1" }
        : a?.p_username === "bob"
          ? { error: "groups.user_not_found" }
          : {},
    );
    const r = await createGroup(c, { name: "Team", members: ["ann", "bob"] });
    expect(r).toEqual({
      ok: true,
      value: { conversationId: "g1", failedInvites: [{ username: "bob", code: "groups.user_not_found" }] },
    });
  });

  it("fails when groups_create fails", async () => {
    const c = client(() => ({ error: "groups.invalid_name" }));
    const r = await createGroup(c, { name: "" });
    expect(r).toMatchObject({ ok: false, error: { code: "groups.invalid_name" } });
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("members", () => {
  it("maps member rows", async () => {
    const c = client(() => ({
      data: [
        {
          user_id: "u1",
          username: "ann",
          display_name: "Ann",
          avatar_url: null,
          role: "owner",
          joined_at: "2026-01-01",
          messaging_restricted: false,
        },
      ],
    }));
    const r = await listMembers(c, "g1");
    expect(r).toMatchObject({ ok: true, value: [{ userId: "u1", displayName: "Ann", role: "owner" }] });
  });

  it("removes a member and leaves", async () => {
    const c = client(() => ({}));
    await removeMember(c, { conversationId: "g1", userId: "u2" });
    await leaveGroup(c, "g1");
    expect(c.rpc.mock.calls).toEqual([
      ["groups_remove_member", { p_conversation_id: "g1", p_user_id: "u2" }],
      ["groups_leave", { p_conversation_id: "g1" }],
    ]);
  });
});
