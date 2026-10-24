import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, createTestDb, createUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function newUser(name: string) {
  const user = await createUser(db, { username: name });
  return { ...user, rpc: createRpcClient(db, user.id) };
}

async function registerDevice(u: Awaited<ReturnType<typeof newUser>>) {
  const id = randomUUID();
  const res = await u.rpc.rpc("register_device", {
    p_device_id: id,
    p_name: "Laptop",
    p_platform: "web",
    p_identity_key: `idk-${id}`,
    p_signing_key: `sgk-${id}`,
    p_account_signature: "sig",
    p_account_signing_key: "account-key",
  });
  expect(res.error).toBeNull();
  return id;
}

async function makeGroup(ownerId: string, members: { id: string; role: string }[] = []) {
  const conv = randomUUID();
  await asSuperuser(
    db,
    "insert into public.conversations (id, type, title, created_by) values ($1, 'group', 'G', $2)",
    [conv, ownerId],
  );
  await asSuperuser(
    db,
    "insert into public.conversation_members (conversation_id, user_id, role) values ($1, $2, 'owner')",
    [conv, ownerId],
  );
  for (const m of members) {
    await asSuperuser(
      db,
      "insert into public.conversation_members (conversation_id, user_id, role) values ($1, $2, $3::public.member_role)",
      [conv, m.id, m.role],
    );
  }
  return conv;
}

const blob = Buffer.from("ciphertext-bytes").toString("base64");

describe("group_state RPCs (issue #249)", () => {
  it("lets an admin write with their own device and bumps the version", async () => {
    const owner = await newUser("gs_owner");
    const admin = await newUser("gs_admin");
    const conv = await makeGroup(owner.id, [{ id: admin.id, role: "admin" }]);
    const dev = await registerDevice(admin);

    const first = await admin.rpc.rpc("put_group_state", {
      p_conversation_id: conv,
      p_device_id: dev,
      p_ciphertext: blob,
      p_expected_version: 0,
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);

    const second = await admin.rpc.rpc("put_group_state", {
      p_conversation_id: conv,
      p_device_id: dev,
      p_ciphertext: blob,
      p_expected_version: 1,
    });
    expect(second.data).toBe(2);

    const stale = await admin.rpc.rpc("put_group_state", {
      p_conversation_id: conv,
      p_device_id: dev,
      p_ciphertext: blob,
      p_expected_version: 1,
    });
    expect(stale.error?.message).toContain("e2ee.group_state_conflict");
  });

  it("rejects a plain member", async () => {
    const owner = await newUser("gs_owner2");
    const member = await newUser("gs_member2");
    const conv = await makeGroup(owner.id, [{ id: member.id, role: "member" }]);
    const dev = await registerDevice(member);

    const res = await member.rpc.rpc("put_group_state", {
      p_conversation_id: conv,
      p_device_id: dev,
      p_ciphertext: blob,
      p_expected_version: 0,
    });
    expect(res.error).not.toBeNull();
    const rows = await asSuperuser<{ rows: unknown[] }>(
      db,
      "select 1 from public.group_state where conversation_id = $1",
      [conv],
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("rejects an admin passing another user's device", async () => {
    const owner = await newUser("gs_owner3");
    const admin = await newUser("gs_admin3");
    const conv = await makeGroup(owner.id, [{ id: admin.id, role: "admin" }]);
    const ownerDev = await registerDevice(owner);

    const res = await admin.rpc.rpc("put_group_state", {
      p_conversation_id: conv,
      p_device_id: ownerDev,
      p_ciphertext: blob,
      p_expected_version: 0,
    });
    expect(res.error?.message).toContain("e2ee.device_not_found");
  });

  it("get_group_state returns the blob to an active member and refuses a non-member", async () => {
    const owner = await newUser("gs_owner4");
    const member = await newUser("gs_member4");
    const outsider = await newUser("gs_outsider4");
    const conv = await makeGroup(owner.id, [{ id: member.id, role: "member" }]);
    const dev = await registerDevice(owner);
    expect(
      (
        await owner.rpc.rpc("put_group_state", {
          p_conversation_id: conv,
          p_device_id: dev,
          p_ciphertext: blob,
          p_expected_version: 0,
        })
      ).error,
    ).toBeNull();

    const read = await member.rpc.rpc("get_group_state", { p_conversation_id: conv });
    expect(read.error).toBeNull();
    expect(read.data).toEqual([{ version: 1, ciphertext: blob }]);

    const denied = await outsider.rpc.rpc("get_group_state", { p_conversation_id: conv });
    expect(denied.error).not.toBeNull();
  });
});

describe("256-member cap trigger (issue #249)", () => {
  it("rejects the 257th active member", async () => {
    const owner = await newUser("cap_owner");
    const conv = await makeGroup(owner.id);
    await asSuperuser(
      db,
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       select gen_random_uuid(), 'capm' || i || '@pulse.test', now(),
              jsonb_build_object('username', 'capm' || i)
       from generate_series(1, 256) i`,
    );
    const users = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      "select id from public.profiles where username like 'capm%' order by username",
    );
    expect(users.rows).toHaveLength(256);

    // Owner + 255 = 256 members: allowed.
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id)
       select $1, id from public.profiles where username like 'capm%' order by username limit 255`,
      [conv],
    );
    const count = await asSuperuser<{ rows: { n: number }[] }>(
      db,
      "select count(*)::int as n from public.conversation_members where conversation_id = $1 and left_at is null",
      [conv],
    );
    expect(count.rows[0]!.n).toBe(256);

    const extra = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      `select p.id from public.profiles p where p.username like 'capm%'
         and not exists (select 1 from public.conversation_members m
                         where m.conversation_id = $1 and m.user_id = p.id) limit 1`,
      [conv],
    );
    await expect(
      asSuperuser(
        db,
        "insert into public.conversation_members (conversation_id, user_id) values ($1, $2)",
        [conv, extra.rows[0]!.id],
      ),
    ).rejects.toThrow(/groups\.member_limit/);
  }, 120_000);
});
