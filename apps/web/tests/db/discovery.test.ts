import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clearAllRecentSearches,
  clearRecentSearch,
  favorite,
  getProfile,
  listFavorites,
  listRecentSearches,
  searchByUsername,
  unfavorite,
} from "@/features/discovery-contacts/service";
import { RATE_LIMITS } from "@pulse/core/limit";

import { asSuperuser, asUser, createTestDb, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createDiscoveryUser(
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

async function insertGroupWithMembers(
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

describe("discovery searchByUsername", () => {
  it("matches case-insensitively and returns public card fields", async () => {
    const target = await createDiscoveryUser("find_me", {
      display_name: "Find Me",
      bio: "Hello",
    });
    const actor = await createDiscoveryUser("searcher_a");
    const rpc = createRpcClient(db, actor.id);

    const result = await searchByUsername(rpc, "  FIND_ME  ");
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) {
      throw new Error("expected hit");
    }
    expect(result.value.id).toBe(target.id);
    expect(result.value.username).toBe("find_me");
    expect(result.value.displayName).toBe("Find Me");
    expect(result.value.bio).toBe("Hello");
    expect(result.value).not.toHaveProperty("email");
  });

  it("returns null for missing, undiscoverable, private, and blocked targets", async () => {
    const actor = await createDiscoveryUser("searcher_b");
    const hidden = await createDiscoveryUser("undisc", {
      discoverable: false,
    });
    const priv = await createDiscoveryUser("priv_u", {
      profile_visibility: "private",
    });
    const blocked = await createDiscoveryUser("blk_tgt");
    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [actor.id, blocked.id],
    );

    const rpc = createRpcClient(db, actor.id);

    expect(await searchByUsername(rpc, "no_such_user_xyz")).toEqual({
      ok: true,
      value: null,
    });
    expect(await searchByUsername(rpc, hidden.username)).toEqual({
      ok: true,
      value: null,
    });
    expect(await searchByUsername(rpc, priv.username)).toEqual({
      ok: true,
      value: null,
    });
    expect(await searchByUsername(rpc, blocked.username)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("allows contacts-only profile after either side favorites", async () => {
    const actor = await createDiscoveryUser("searcher_c");
    const target = await createDiscoveryUser("contacts_only", {
      profile_visibility: "contacts",
    });
    const rpc = createRpcClient(db, actor.id);

    expect(await searchByUsername(rpc, target.username)).toEqual({
      ok: true,
      value: null,
    });

    await favorite(rpc, target.username);

    const after = await searchByUsername(rpc, target.username);
    expect(after.ok).toBe(true);
    expect(after.ok && after.value?.username).toBe(target.username);
  });

  it("returns platform.rate_limited and skips recent search when over cap", async () => {
    const actor = await createDiscoveryUser("searcher_rate");
    const rpc = createRpcClient(db, actor.id);

    for (let i = 0; i < RATE_LIMITS.search_users.max; i++) {
      const u = await createDiscoveryUser(`rate_tgt_${i}`);
      const hit = await searchByUsername(rpc, u.username);
      expect(hit.ok).toBe(true);
    }

    const blocked = await searchByUsername(rpc, "anyone_left");
    expect(blocked).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });

    const recents = await listRecentSearches(rpc);
    expect(recents.ok).toBe(true);
    if (recents.ok) {
      expect(recents.value.length).toBeLessThanOrEqual(
        RATE_LIMITS.search_users.max,
      );
    }
  });
});

describe("recent searches", () => {
  it("keeps latest 10 and supports clear one or all", async () => {
    const actor = await createDiscoveryUser("recents_user");
    const rpc = createRpcClient(db, actor.id);

    for (let i = 0; i < 11; i++) {
      const u = await createDiscoveryUser(`recent_${i}`);
      await searchByUsername(rpc, u.username);
    }

    const list = await listRecentSearches(rpc);
    expect(list.ok).toBe(true);
    if (!list.ok) {
      throw new Error("list failed");
    }
    expect(list.value).toHaveLength(10);

    const removeId = list.value[list.value.length - 1]!.id;
    await clearRecentSearch(rpc, removeId);
    const afterOne = await listRecentSearches(rpc);
    expect(afterOne.ok && afterOne.value).toHaveLength(9);

    await clearAllRecentSearches(rpc);
    const afterAll = await listRecentSearches(rpc);
    expect(afterAll.ok && afterAll.value).toHaveLength(0);
  });

  it("is private to the owner", async () => {
    const owner = await createDiscoveryUser("rec_owner");
    const other = await createDiscoveryUser("rec_other");
    const target = await createDiscoveryUser("rec_target");
    const ownerRpc = createRpcClient(db, owner.id);
    await searchByUsername(ownerRpc, target.username);

    const leaked = await asUser<{ rows: unknown[] }>(
      db,
      other.id,
      `select id from public.recent_searches where user_id = $1`,
      [owner.id],
    );
    expect(leaked.rows).toHaveLength(0);
  });
});

describe("getProfile", () => {
  it("allows signed-out public discoverable profiles and denies private", async () => {
    const pub = await createDiscoveryUser("public_prof", {
      profile_visibility: "public",
      discoverable: true,
    });
    await createDiscoveryUser("private_prof", {
      profile_visibility: "private",
      discoverable: true,
    });

    const anon = createRpcClient(db, null);
    const pubResult = await getProfile(anon, pub.username);
    expect(pubResult.ok).toBe(true);

    const privResult = await getProfile(anon, "private_prof");
    expect(privResult).toEqual({
      ok: false,
      error: { code: "discovery.not_found" },
    });
  });

  it("includes shared groups for members and omits groups the viewer left", async () => {
    const viewer = await createDiscoveryUser("prof_viewer");
    const target = await createDiscoveryUser("prof_target");
    const sharedId = await insertGroupWithMembers(
      [viewer.id, target.id],
      "Our Group",
    );
    const leftId = await insertGroupWithMembers(
      [viewer.id, target.id],
      "Left Group",
    );
    await asSuperuser(
      db,
      `update public.conversation_members
       set left_at = now()
       where conversation_id = $1 and user_id = $2`,
      [leftId, viewer.id],
    );

    const rpc = createRpcClient(db, viewer.id);
    const profile = await getProfile(rpc, target.username);
    expect(profile.ok).toBe(true);
    if (!profile.ok) {
      throw new Error("profile failed");
    }
    expect(profile.value.sharedGroups?.map((g) => g.id)).toEqual([sharedId]);
  });

  it("omits last seen when show_last_seen is false", async () => {
    const viewer = await createDiscoveryUser("seen_viewer");
    const target = await createDiscoveryUser("seen_target", {
      show_last_seen: false,
      last_seen_at: new Date().toISOString(),
    });
    const rpc = createRpcClient(db, viewer.id);
    const profile = await getProfile(rpc, target.username);
    expect(profile.ok).toBe(true);
    if (!profile.ok) {
      throw new Error("profile failed");
    }
    expect(profile.value.lastSeenAt).toBeUndefined();
  });
});

describe("favorites", () => {
  it("is idempotent and rejects self-favorite", async () => {
    const actor = await createDiscoveryUser("fav_actor");
    const target = await createDiscoveryUser("fav_target");
    const rpc = createRpcClient(db, actor.id);

    const first = await favorite(rpc, target.username);
    const second = await favorite(rpc, target.username);
    expect(first.ok && second.ok).toBe(true);

    const rows = await asUser<{ rows: unknown[] }>(
      db,
      actor.id,
      `select favorite_user_id from public.favorites where user_id = $1`,
      [actor.id],
    );
    expect(rows.rows).toHaveLength(1);

    const self = await favorite(rpc, actor.username);
    expect(self).toEqual({
      ok: false,
      error: { code: "discovery.cannot_favorite_self" },
    });
  });

  it("returns discovery.not_found when unfavoriting missing row", async () => {
    const actor = await createDiscoveryUser("unfav_actor");
    const target = await createDiscoveryUser("unfav_target");
    const rpc = createRpcClient(db, actor.id);

    const missing = await unfavorite(rpc, target.username);
    expect(missing).toEqual({
      ok: false,
      error: { code: "discovery.not_found" },
    });
  });

  it("is private to the owner", async () => {
    const owner = await createDiscoveryUser("fav_owner");
    const other = await createDiscoveryUser("fav_other");
    const target = await createDiscoveryUser("fav_priv_tgt");
    const ownerRpc = createRpcClient(db, owner.id);
    await favorite(ownerRpc, target.username);

    const leaked = await asUser<{ rows: unknown[] }>(
      db,
      other.id,
      `select favorite_user_id from public.favorites where user_id = $1`,
      [owner.id],
    );
    expect(leaked.rows).toHaveLength(0);

    const list = await listFavorites(ownerRpc);
    expect(list.ok && list.value).toHaveLength(1);
  });
});
