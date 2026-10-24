import { afterEach, describe, expect, it } from "vitest";

import { createSqlLocalStore } from "@pulse/core/local-store";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import { createRecoveryKey } from "@pulse/core/backup";

import { createBackupFile, isFreshDevice, restoreFromBackupFile } from "./service";

const opened: Array<{ close(): void }> = [];
afterEach(() => {
  for (const o of opened.splice(0)) o.close();
});

async function open() {
  const exec = createNodeSqliteExecutor();
  opened.push(exec);
  const store = createSqlLocalStore(exec);
  await store.init();
  return store;
}

const PASS = { kind: "passphrase", passphrase: "correct horse battery" } as const;

describe("backup service", () => {
  it("restores on a Fresh Device and rebuilds the chats", async () => {
    const old = await open();
    await old.upsertConversations([
      { id: "c1", kind: "direct", title: "Sara", avatar: null, last_message_id: "m1", unread_count: 1, updated_at: "2026-01-01" },
    ]);
    await old.upsertMessages([
      {
        id: "m1",
        conversation_id: "c1",
        sender_user_id: "u1",
        sender_device_id: null,
        sent_at: "2026-01-01T00:00:00Z",
        received_at: "2026-01-01T00:00:00Z",
        kind: "text",
        body: "hello again",
        reply_to_id: null,
        edited_at: null,
        deleted: 0,
        status: null,
        media_json: null,
      },
    ]);

    const made = await createBackupFile(old, PASS);
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    const fresh = await open();
    expect(await isFreshDevice(fresh)).toBe(true);
    const res = await restoreFromBackupFile(fresh, made.value, PASS);
    expect(res).toMatchObject({ ok: true, value: { conversations: 1, messages: 1 } });
    expect(await isFreshDevice(fresh)).toBe(false);
    expect((await fresh.listMessages("c1"))[0]?.body).toBe("hello again");
  });

  it("reports typed errors and writes nothing on a wrong secret or damaged file", async () => {
    const old = await open();
    await old.upsertConversations([
      { id: "c1", kind: "direct", title: "Sara", avatar: null, last_message_id: null, unread_count: 0, updated_at: "2026-01-01" },
    ]);
    const made = await createBackupFile(old, { kind: "recovery", recoveryKey: createRecoveryKey() });
    if (!made.ok) throw new Error("export failed");

    const fresh = await open();
    const wrong = await restoreFromBackupFile(fresh, made.value, PASS);
    expect(wrong).toEqual({ ok: false, error: "invalid_secret" });
    const cut = await restoreFromBackupFile(fresh, made.value.slice(0, made.value.length - 4), {
      kind: "recovery",
      recoveryKey: createRecoveryKey(),
    });
    expect(cut.ok).toBe(false);
    expect(await isFreshDevice(fresh)).toBe(true);
    expect(await createBackupFile(null, PASS)).toEqual({ ok: false, error: "no_store" });
  });
});
