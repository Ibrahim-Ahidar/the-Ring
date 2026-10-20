import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callRpc } from "@pulse/core/rpc";

import { asAnon, asSuperuser, asUser, createTestDb, createUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
  // Hosted Supabase ships storage.objects with RLS on; the PGlite stub does not.
  await db.exec("alter table storage.objects enable row level security;");
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function insertObject(userId: string, name: string) {
  return asUser(
    db,
    userId,
    `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`,
    [name, userId],
  );
}

describe("public avatars bucket (#57)", () => {
  it("is public and limited to images within 8 MB", async () => {
    const { rows } = await asSuperuser<{
      rows: { public: boolean; file_size_limit: number; allowed_mime_types: string[] }[];
    }>(
      db,
      `select public, file_size_limit, allowed_mime_types
         from storage.buckets where id = 'avatars'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.public).toBe(true);
    expect(Number(rows[0]!.file_size_limit)).toBe(8 * 1024 * 1024);
    expect(rows[0]!.allowed_mime_types).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
  });

  it("lets members write only inside their own folder", async () => {
    const owner = await createUser(db, { username: "avatar_owner" });
    const other = await createUser(db, { username: "avatar_other" });

    await expect(insertObject(owner.id, `${owner.id}/a.png`)).resolves.toBeDefined();
    await expect(insertObject(other.id, `${owner.id}/b.png`)).rejects.toThrow();
    await expect(
      asAnon(
        db,
        `insert into storage.objects (bucket_id, name) values ('avatars', $1)`,
        [`${owner.id}/c.png`],
      ),
    ).rejects.toThrow();

    const deleted = await asUser<{ affectedRows?: number }>(
      db,
      other.id,
      `delete from storage.objects where bucket_id = 'avatars' and name = $1`,
      [`${owner.id}/a.png`],
    );
    expect(deleted.affectedRows ?? 0).toBe(0);

    const ownDelete = await asUser<{ affectedRows?: number }>(
      db,
      owner.id,
      `delete from storage.objects where bucket_id = 'avatars' and name = $1`,
      [`${owner.id}/a.png`],
    );
    expect(ownDelete.affectedRows).toBe(1);
  });

  it("stores the avatar path so profile reads return it, and clears it on remove", async () => {
    const user = await createUser(db, { username: "avatar_setter" });
    const rpc = createRpcClient(db, user.id);
    const path = `avatars/${user.id}/photo.png`;

    const set = await callRpc(rpc, "identity_set_avatar_path", { p_storage_path: path });
    expect(set.ok).toBe(true);

    const own = await callRpc<{ avatar_url: string | null }[]>(
      rpc,
      "identity_get_own_profile",
    );
    expect(own.ok && own.value[0]!.avatar_url).toBe(path);

    // The PGlite RPC shim wraps zero-arg scalar results in a row, so call it directly.
    const cleared = await asUser<{ rows: { value: string | null }[] }>(
      db,
      user.id,
      "select public.identity_clear_avatar() as value",
    );
    expect(cleared.rows[0]!.value).toBe(path);

    const after = await callRpc<{ avatar_url: string | null }[]>(
      rpc,
      "identity_get_own_profile",
    );
    expect(after.ok && after.value[0]!.avatar_url).toBeNull();
  });

  it("refuses identity_clear_avatar for anonymous callers", async () => {
    const anon = createRpcClient(db, null);
    const result = await callRpc(anon, "identity_clear_avatar");
    expect(result.ok).toBe(false);
  });
});
