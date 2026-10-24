import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import {
  createSqlLocalStore,
  type LocalStore,
  type SqlExecutor,
} from "@pulse/core/local-store";

import { createExpoSqliteExecutor, type ExpoDatabaseLike } from "./expo-sqlite-executor";

export type LocalDb = { store: LocalStore; db: SqlExecutor };

const DB_NAME = "pulse-local.db";

type Opened = { handle: LocalDb; raw: ExpoDatabaseLike };

async function defaultOpen(): Promise<ExpoDatabaseLike> {
  // Required lazily so the native module is only touched with the flag on.
  const sqlite = require("expo-sqlite") as {
    openDatabaseAsync(name: string): Promise<ExpoDatabaseLike>;
  };
  return sqlite.openDatabaseAsync(DB_NAME);
}

export async function openLocalDb(open: () => Promise<ExpoDatabaseLike>): Promise<Opened> {
  const raw = await open();
  const db = createExpoSqliteExecutor(raw);
  const store = createSqlLocalStore(db);
  await store.init();
  return { handle: { store, db }, raw };
}

let opened: Promise<Opened> | null = null;

/** The on-device database, or null when the e2ee flag is off or SQLite is unavailable. */
export function getLocalDb(open: () => Promise<ExpoDatabaseLike> = defaultOpen): Promise<LocalDb | null> {
  if (!isE2eeEnabled()) return Promise.resolve(null);
  opened ??= openLocalDb(open);
  return opened.then(
    (o) => o.handle,
    () => {
      opened = null;
      return null;
    },
  );
}

const deletedListeners = new Set<() => void>();
/** Registers a callback for when the local database was deleted (logout). */
export function onLocalDbDeleted(cb: () => void): void {
  deletedListeners.add(cb);
}

/** Logout: empty the local database. The next getLocalDb() starts clean. */
export async function deleteLocalDatabase(): Promise<void> {
  const current = opened;
  opened = null;
  if (!current) return;
  deletedListeners.forEach((cb) => cb());
  try {
    const o = await current;
    await o.handle.store.wipe();
    await o.raw.closeAsync?.();
  } catch {
    // opening failed: nothing to delete
  }
}

/** Test hook: forget the cached handle without touching data. */
export function resetLocalDbForTests(): void {
  opened = null;
}
