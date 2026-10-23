import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./pglite";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("server_now (issue #215)", () => {
  it("returns the database clock in epoch milliseconds to signed-in users", async () => {
    const user = await createUser(db, { username: "clock_user" });
    const before = Date.now();
    const result = await asUser<{ rows: { server_now: string | number }[] }>(
      db,
      user.id,
      "select public.server_now() as server_now",
    );
    const value = Number(result.rows[0].server_now);
    expect(Math.abs(value - before)).toBeLessThan(5000);
  });

  it("is not callable by anon", async () => {
    await expect(asAnon(db, "select public.server_now()")).rejects.toThrow(/permission denied/);
  });
});
