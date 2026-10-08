import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb } from "./pglite";

/**
 * Guards against a security-definer function being callable from the browser
 * without checking who is calling. Every new anon-callable function and every
 * definer function that legitimately has no `auth.uid()` check must be listed
 * here, with the reason, after review.
 */
const ANON_CALLABLE = new Set<string>([
  // Public profile page for anonymous visitors; returns public, discoverable profiles only.
  "discovery_get_profile",
]);

const DEFINER_WITHOUT_AUTH_UID = new Set<string>([
  // Read-only predicates used by RLS policies; they reveal only facts about the caller
  // or refuse third-party probes internally.
  "is_member",
]);

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

type FnRow = { name: string; definer: boolean; body: string };

async function executableBy(role: string): Promise<FnRow[]> {
  const result = await db.query<FnRow>(
    `select p.proname as name, p.prosecdef as definer, p.prosrc as body
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege($1, p.oid, 'execute')`,
    [role],
  );
  return result.rows;
}

describe("function grants", () => {
  it("anon can execute only reviewed functions", async () => {
    const names = (await executableBy("anon"))
      .map((row) => row.name)
      .filter((name) => !name.startsWith("_test_"));
    const unexpected = names.filter((name) => !ANON_CALLABLE.has(name));
    expect(unexpected).toEqual([]);
  });

  it("every security-definer function callable by authenticated checks auth.uid()", async () => {
    const rows = await executableBy("authenticated");
    const unchecked = rows
      .filter((row) => row.definer)
      .filter((row) => !/auth\.uid\(\)/.test(row.body))
      .filter((row) => !/auth\.role\(\)/.test(row.body))
      .map((row) => row.name)
      .filter((name) => !DEFINER_WITHOUT_AUTH_UID.has(name));
    expect(unchecked).toEqual([]);
  });
});
