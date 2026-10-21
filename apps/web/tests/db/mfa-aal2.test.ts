import type { PGliteInterface } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, createUser, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;
let enrolled: TestUser;
let plain: TestUser;

beforeAll(async () => {
  db = await createTestDb();
  enrolled = await createUser(db, { username: "mfa_enrolled" });
  plain = await createUser(db, { username: "mfa_plain" });
  await db.query(
    `insert into auth.mfa_factors (user_id, friendly_name, status) values ($1, 'Phone', 'verified')`,
    [enrolled.id],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("AAL2 backstop", () => {
  it("denies sensitive RPCs at AAL1 for a member with a verified factor", async () => {
    const rpc = createRpcClient(db, enrolled.id, { aal: "aal1" });
    const device = await rpc.rpc("identity_upsert_device", { p_device_id: randomUUID() });
    expect(device.error?.message).toContain("identity.mfa_required");
    const del = await rpc.rpc("identity_delete_account", { p_username_confirm: "mfa_enrolled" });
    expect(del.error?.message).toContain("identity.mfa_required");
    const others = await rpc.rpc("identity_revoke_other_devices", {
      p_current_device_id: randomUUID(),
    });
    expect(others.error?.message).toContain("identity.mfa_required");
  });

  it("treats a missing aal claim as AAL1", async () => {
    const rpc = createRpcClient(db, enrolled.id);
    const device = await rpc.rpc("identity_upsert_device", { p_device_id: randomUUID() });
    expect(device.error?.message).toContain("identity.mfa_required");
  });

  it("allows the same RPCs at AAL2", async () => {
    const rpc = createRpcClient(db, enrolled.id, { aal: "aal2" });
    const device = await rpc.rpc("identity_upsert_device", { p_device_id: randomUUID() });
    expect(device.error).toBeNull();
  });

  it("does not affect members without a verified factor", async () => {
    const rpc = createRpcClient(db, plain.id, { aal: "aal1" });
    const device = await rpc.rpc("identity_upsert_device", { p_device_id: randomUUID() });
    expect(device.error).toBeNull();
  });

  it("ignores unverified factors", async () => {
    const other = await createUser(db, { username: "mfa_pending" });
    await db.query(
      `insert into auth.mfa_factors (user_id, friendly_name, status) values ($1, 'x', 'unverified')`,
      [other.id],
    );
    const rpc = createRpcClient(db, other.id, { aal: "aal1" });
    const device = await rpc.rpc("identity_upsert_device", { p_device_id: randomUUID() });
    expect(device.error).toBeNull();
  });
});
