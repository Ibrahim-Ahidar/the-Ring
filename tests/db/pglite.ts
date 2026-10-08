import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const STUB_PATH = path.join(REPO_ROOT, "tests/db/supabase-stub.sql");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

let templateReady: Promise<PGliteInterface> | null = null;

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(MIGRATIONS_DIR, name));
}

async function bootstrapDb(db: PGliteInterface): Promise<void> {
  const stubSql = await readFile(STUB_PATH, "utf8");
  await db.exec(stubSql);

  for (const file of await listMigrationFiles()) {
    const sql = await readFile(file, "utf8");
    await db.exec(sql);
  }
}

async function getTemplateDb(): Promise<PGliteInterface> {
  if (!templateReady) {
    templateReady = (async () => {
      const db = new PGlite();
      await bootstrapDb(db);
      return db;
    })();
  }
  return templateReady;
}

export async function createTestDb(): Promise<PGliteInterface> {
  const template = await getTemplateDb();
  if (typeof template.clone === "function") {
    return await template.clone();
  }
  const db = new PGlite();
  await bootstrapDb(db);
  return db;
}

export type TestUser = {
  id: string;
  username: string;
};

export type CreateUserOptions = {
  username: string;
  email?: string;
  profileOverrides?: Record<string, unknown>;
};

export async function createUser(
  db: PGliteInterface,
  options: CreateUserOptions,
): Promise<TestUser> {
  const id = randomUUID();
  const email = options.email ?? `${options.username}@pulse.test`;

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify({ username: options.username })],
  );

  // A signup trigger may already have created the profile; upsert either way.
  const overrideKeys = Object.keys(options.profileOverrides ?? {});
  const columns = ["id", "username", ...overrideKeys];
  const values: unknown[] = [id, options.username];
  for (const key of overrideKeys) {
    values.push(options.profileOverrides![key]);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const updates = ["username", ...overrideKeys]
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  await db.query(
    `insert into public.profiles (${columns.join(", ")})
     values (${placeholders})
     on conflict (id) do update set ${updates}`,
    values,
  );

  return { id, username: options.username };
}

type QueryParams = unknown[];

async function withJwtContext<T>(
  db: PGliteInterface,
  userId: string | null,
  role: "anon" | "authenticated",
  fn: (tx: PGliteInterface) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    const claims = userId
      ? JSON.stringify({ sub: userId, role: "authenticated" })
      : JSON.stringify({ role: "anon" });
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const result = await fn(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function asUser<T>(
  db: PGliteInterface,
  userId: string,
  sql: string,
  params: QueryParams = [],
): Promise<T> {
  return withJwtContext(db, userId, "authenticated", async (tx) => {
    const result = await tx.query(sql, params);
    return result as T;
  });
}

export async function asAnon<T>(
  db: PGliteInterface,
  sql: string,
  params: QueryParams = [],
): Promise<T> {
  return withJwtContext(db, null, "anon", async (tx) => {
    const result = await tx.query(sql, params);
    return result as T;
  });
}

/** Superuser fixture writes (bypass RLS). */
export async function asSuperuser<T>(
  db: PGliteInterface,
  sql: string,
  params: QueryParams = [],
): Promise<T> {
  const result = await db.query(sql, params);
  return result as T;
}
