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

async function seedSession(userId: string): Promise<string> {
  const id = randomUUID();
  await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [id, userId]);
  return id;
}

function reg(rpc: ReturnType<typeof createRpcClient>, id: string, extra: Record<string, unknown> = {}) {
  return rpc.rpc("register_device", {
    p_device_id: id,
    p_name: "Laptop",
    p_platform: "web",
    p_identity_key: `idk-${id}`,
    p_signing_key: `sgk-${id}`,
    p_account_signing_key: "account-key",
    ...extra,
  });
}

describe("e2ee approval leftovers (issue #255)", () => {
  it("register_device refuses a re-register of the same device id with different keys", async () => {
    const u = await createUser(db, { username: "lo_rereg" });
    const sid = await seedSession(u.id);
    const rpc = createRpcClient(db, u.id, { session_id: sid });
    const id = randomUUID();
    expect((await reg(rpc, id)).error).toBeNull();

    const changed = await reg(rpc, id, { p_identity_key: "other-idk" });
    expect(changed.error?.message).toContain("e2ee.device_keys_changed");
    const changedSigning = await reg(rpc, id, { p_signing_key: "other-sgk" });
    expect(changedSigning.error?.message).toContain("e2ee.device_keys_changed");

    // Same keys is still fine and refreshes the name.
    expect((await reg(rpc, id, { p_name: "Renamed" })).error).toBeNull();
    const row = await asSuperuser<{ rows: { name: string; identity_key: string }[] }>(
      db,
      "select name, identity_key from public.e2ee_devices where id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ name: "Renamed", identity_key: `idk-${id}` });
  });

  it("list_pending_devices needs a session id, like approve and deny", async () => {
    const u = await createUser(db, { username: "lo_pending" });
    const sid = await seedSession(u.id);
    const rpc = createRpcClient(db, u.id, { session_id: sid });
    expect((await reg(rpc, randomUUID())).error).toBeNull();

    const sid2 = await seedSession(u.id);
    const rpc2 = createRpcClient(db, u.id, { session_id: sid2 });
    const pending = randomUUID();
    const asked = await rpc2.rpc("add_fresh_device", {
      p_device_id: pending,
      p_name: "Phone",
      p_platform: "ios",
      p_identity_key: "i",
      p_signing_key: "s",
    });
    expect(asked.data).toBe("pending");

    const withSession = await rpc.rpc("list_pending_devices", {});
    expect((withSession.data as { id: string }[]).map((d) => d.id)).toEqual([pending]);

    const noSession = createRpcClient(db, u.id);
    const without = await noSession.rpc("list_pending_devices", {});
    expect(without.error).toBeNull();
    expect(without.data).toEqual([]);

    // A session that belongs to the pending device itself sees nothing either.
    const other = await rpc2.rpc("list_pending_devices", {});
    expect(other.data).toEqual([]);
  });
});
