import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore } from "../local-store";
import { createNodeSqliteExecutor } from "../local-store/node-sqlite-executor";
import type { MessageRow } from "../local-store/types";
import { buildBackupPayload, exportBackup, restoreBackup } from "./backup";
import { BackupError } from "./errors";
import { createRecoveryKey, decryptBackup, encryptBackup } from "./format";

const FAST = { argon2: { m: 64, t: 1, p: 1 } };
const PASS = { kind: "passphrase", passphrase: "correct horse battery" } as const;

function msg(id: string, sentAt: string, over: Partial<MessageRow> = {}): MessageRow {
  return {
    id,
    conversation_id: "c1",
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: sentAt,
    received_at: sentAt,
    kind: "text",
    body: `body ${id}`,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
    ...over,
  };
}

async function open() {
  const exec = createNodeSqliteExecutor();
  const store = createSqlLocalStore(exec);
  await store.init();
  return { exec, store };
}

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BackupError);
  expect((err as BackupError).code).toBe(code);
}

describe("backup format", () => {
  const text = new TextEncoder().encode("x".repeat(1000));

  it("round trips across several chunks with a passphrase and a recovery key", async () => {
    const file = await encryptBackup(text, PASS, { ...FAST, chunkSize: 128 });
    expect(await decryptBackup(file, PASS)).toEqual(text);
    const recovery = { kind: "recovery", recoveryKey: createRecoveryKey() } as const;
    const file2 = await encryptBackup(text, recovery, { chunkSize: 128 });
    expect(await decryptBackup(file2, recovery)).toEqual(text);
    expect(recovery.recoveryKey.replace(/-/g, "")).toMatch(/^[0-9]{64}$/);
  });

  it("round trips an empty payload", async () => {
    const file = await encryptBackup(new Uint8Array(), PASS, FAST);
    expect((await decryptBackup(file, PASS)).length).toBe(0);
  });

  it("fails a wrong passphrase and a wrong recovery key with a typed error", async () => {
    const file = await encryptBackup(text, PASS, FAST);
    await expectCode(decryptBackup(file, { kind: "passphrase", passphrase: "nope" }), "wrong_secret");
    const recovery = { kind: "recovery", recoveryKey: createRecoveryKey() } as const;
    const file2 = await encryptBackup(text, recovery);
    await expectCode(
      decryptBackup(file2, { kind: "recovery", recoveryKey: createRecoveryKey() }),
      "wrong_secret",
    );
    await expectCode(decryptBackup(file2, { kind: "recovery", recoveryKey: "123" }), "invalid_secret");
    await expectCode(decryptBackup(file, { kind: "passphrase", passphrase: "" }), "invalid_secret");
  });

  it("rejects a tampered chunk, header, reordered chunks and non-backups", async () => {
    const file = await encryptBackup(text, PASS, { ...FAST, chunkSize: 128 });
    const bad = file.slice();
    bad[bad.length - 40] ^= 1;
    await expectCode(decryptBackup(bad, PASS), "corrupt");

    const badHeader = file.slice();
    badHeader[110] ^= 1;
    await expectCode(decryptBackup(badHeader, PASS), "wrong_secret");

    // swap the first two chunks (each frame = 4 + 128 + 16 bytes)
    const frame = 4 + 128 + 16;
    const swapped = file.slice();
    swapped.set(file.subarray(127 + frame, 127 + 2 * frame), 127);
    swapped.set(file.subarray(127, 127 + frame), 127 + frame);
    await expectCode(decryptBackup(swapped, PASS), "corrupt");

    await expectCode(decryptBackup(new TextEncoder().encode("hello world"), PASS), "unsupported");
  });

  it("rejects truncation at a chunk boundary and mid chunk", async () => {
    const file = await encryptBackup(text, PASS, { ...FAST, chunkSize: 128 });
    const frame = 4 + 128 + 16;
    await expectCode(decryptBackup(file.slice(0, 127 + 2 * frame), PASS), "truncated");
    await expectCode(decryptBackup(file.slice(0, file.length - 5), PASS), "truncated");
    await expectCode(decryptBackup(file.slice(0, 127), PASS), "truncated");
    await expectCode(decryptBackup(file.slice(0, 60), PASS), "truncated");
  });
});

describe("backup of a LocalStore", () => {
  let src: Awaited<ReturnType<typeof open>>;
  beforeEach(async () => {
    src = await open();
    const s = src.store;
    await s.upsertConversations([
      { id: "c1", kind: "direct", title: "Sara", avatar: null, last_message_id: "m3", unread_count: 2, updated_at: "2026-01-03" },
      { id: "c2", kind: "group", title: "Team", avatar: null, last_message_id: null, unread_count: 0, updated_at: "2026-01-01" },
    ]);
    await s.upsertMessages([
      msg("m1", "2026-01-01T00:00:00Z"),
      msg("m2", "2026-01-02T00:00:00Z"),
      msg("m3", "2026-01-03T00:00:00Z", {
        kind: "media",
        body: null,
        media_json: JSON.stringify({ r2Key: "r2/abc", keyB64: "MEDIAFILEKEY" }),
      }),
      msg("g1", "2026-01-01T00:00:00Z", { conversation_id: "c2" }),
    ]);
    await s.setReaction({ message_id: "m1", user_id: "u2", emoji: "+1" });
    await s.upsertReceipt({ message_id: "m1", user_id: "u2", delivered_at: "d", read_at: "r" });
    await s.setKv("read:c1", "2026-01-02T00:00:00Z");
    await s.setKv("pin:m1", "2026-01-02");
    // Key material and sync state that must never leave the device.
    await s.setKv("olm.sessions.DEVICE1", "SESSION_PICKLE_SECRET");
    await s.setKv("sync:conversations", "cursor");
    await s.setKv("ctlout:abc", "pending-outbox");
    await src.exec.exec("INSERT INTO crypto_state (name, pickle) VALUES (?, ?)", ["account", "ACCOUNT_PICKLE_SECRET"]);
  });
  afterEach(() => src.exec.close());

  it("restores on a fresh device and rebuilds the chats", async () => {
    const file = await exportBackup(src.store, PASS, FAST);
    const fresh = await open();
    const summary = await restoreBackup(fresh.store, file, PASS);
    expect(summary).toMatchObject({ conversations: 2, messages: 4, reactions: 1, receipts: 1 });

    expect((await fresh.store.listConversations()).map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect((await fresh.store.listMessages("c1")).map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
    expect(await fresh.store.countMessages("c2")).toBe(1);
    expect(await fresh.store.listReactions(["m1"])).toHaveLength(1);
    expect(await fresh.store.getKv("read:c1")).toBe("2026-01-02T00:00:00Z");
    expect((await fresh.store.searchMessages({ query: "body m2" })).length).toBeGreaterThan(0);
    fresh.exec.close();
  });

  it("leaves media off by default and puts nothing secret in the plaintext", async () => {
    const plain = new TextDecoder().decode(await buildBackupPayload(src.store));
    for (const secret of [
      "SESSION_PICKLE_SECRET",
      "ACCOUNT_PICKLE_SECRET",
      "olm.sessions",
      "MEDIAFILEKEY",
      "r2/abc",
      "pending-outbox",
      "crypto_state",
    ]) {
      expect(plain).not.toContain(secret);
    }
    expect(plain).toContain("body m1");
    expect(plain).toContain('"includeMedia":false');

    const withMedia = new TextDecoder().decode(await buildBackupPayload(src.store, { includeMedia: true }));
    expect(withMedia).toContain("MEDIAFILEKEY");
    expect(withMedia).not.toContain("SESSION_PICKLE_SECRET");
  });

  it("writes nothing when the passphrase is wrong or the file is damaged", async () => {
    const file = await exportBackup(src.store, PASS, FAST);
    const fresh = await open();
    await expectCode(
      restoreBackup(fresh.store, file, { kind: "passphrase", passphrase: "wrong" }),
      "wrong_secret",
    );
    await expectCode(restoreBackup(fresh.store, file.slice(0, file.length - 3), PASS), "truncated");
    expect(await fresh.store.listConversations()).toEqual([]);
    fresh.exec.close();
  });
});
