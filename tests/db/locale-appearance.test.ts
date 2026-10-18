import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { updateAccent, updateLocale, updateTheme } from "@/features/locale-appearance/service";

import { createTestDb, createUser } from "./pglite";
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

async function readProfile(userId: string) {
  const result = await db.query<{
    locale: string;
    theme: string;
  }>(`select locale, theme::text from public.profiles where id = $1`, [
    userId,
  ]);
  return result.rows[0]!;
}

describe("appearance_update_locale", () => {
  it("persists legal locales and rejects invalid values", async () => {
    const user = await createUser(db, { username: "locusera" });
    const rpc = createRpcClient(db, user.id);

    for (const locale of ["ar", "en", "fr"] as const) {
      const result = await updateLocale(rpc, locale);
      expect(result.ok).toBe(true);
      const row = await readProfile(user.id);
      expect(row.locale).toBe(locale);
    }

    const bad = await updateLocale(rpc, "de");
    expect(bad).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
  });

  it("does not let another user change the first user's locale", async () => {
    const owner = await createUser(db, { username: "locowner1" });
    const other = await createUser(db, { username: "locother1" });
    const ownerRpc = createRpcClient(db, owner.id);
    const otherRpc = createRpcClient(db, other.id);

    const saved = await updateLocale(ownerRpc, "fr");
    expect(saved.ok).toBe(true);

    const otherSave = await updateLocale(otherRpc, "en");
    expect(otherSave.ok).toBe(true);

    const ownerRow = await readProfile(owner.id);
    expect(ownerRow.locale).toBe("fr");

    const otherRow = await readProfile(other.id);
    expect(otherRow.locale).toBe("en");
  });
});

describe("appearance_update_theme", () => {
  it("persists legal themes and rejects invalid values", async () => {
    const user = await createUser(db, { username: "themeuser1" });
    const rpc = createRpcClient(db, user.id);

    for (const theme of ["system", "light", "dark"] as const) {
      const result = await updateTheme(rpc, theme);
      expect(result.ok).toBe(true);
      const row = await readProfile(user.id);
      expect(row.theme).toBe(theme);
    }

    const bad = await updateTheme(rpc, "neon");
    expect(bad).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
  });
});

describe("appearance_update_accent", () => {
  it("defaults to indigo, persists legal accents and rejects invalid values", async () => {
    const user = await createUser(db, { username: "accentuser1" });
    const rpc = createRpcClient(db, user.id);

    const initial = await db.query<{ accent: string }>(
      `select accent::text from public.profiles where id = $1`,
      [user.id],
    );
    expect(initial.rows[0]!.accent).toBe("indigo");

    for (const accent of ["green", "indigo"] as const) {
      const result = await updateAccent(rpc, accent);
      expect(result.ok).toBe(true);
      const row = await db.query<{ accent: string }>(
        `select accent::text from public.profiles where id = $1`,
        [user.id],
      );
      expect(row.rows[0]!.accent).toBe(accent);
    }

    const bad = await updateAccent(rpc, "blue");
    expect(bad).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
  });
});
