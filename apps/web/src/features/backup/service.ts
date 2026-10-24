import {
  BackupError,
  createRecoveryKey,
  exportBackup,
  restoreBackup,
  type BackupErrorCode,
  type BackupSecret,
  type RestoreSummary,
} from "@pulse/core/backup";
import type { LocalStore } from "@pulse/core/local-store";

export type BackupFailure = BackupErrorCode | "no_store" | "unexpected";
export type BackupResult<T> = { ok: true; value: T } | { ok: false; error: BackupFailure };

function fail(e: unknown): { ok: false; error: BackupFailure } {
  return { ok: false, error: e instanceof BackupError ? e.code : "unexpected" };
}

export { createRecoveryKey };

/** Encrypts the local history into a backup file. Media is left out unless asked for. */
export async function createBackupFile(
  store: LocalStore | null,
  secret: BackupSecret,
  includeMedia = false,
): Promise<BackupResult<Uint8Array>> {
  if (!store) return { ok: false, error: "no_store" };
  try {
    return { ok: true, value: await exportBackup(store, secret, { includeMedia }) };
  } catch (e) {
    return fail(e);
  }
}

/** Restores a backup file into the local store. Nothing is written unless the whole file verifies. */
export async function restoreFromBackupFile(
  store: LocalStore | null,
  file: Uint8Array,
  secret: BackupSecret,
): Promise<BackupResult<RestoreSummary>> {
  if (!store) return { ok: false, error: "no_store" };
  try {
    return { ok: true, value: await restoreBackup(store, file, secret) };
  } catch (e) {
    return fail(e);
  }
}

/** True when this device has no chats yet, so a restore should be offered. */
export async function isFreshDevice(store: LocalStore | null): Promise<boolean> {
  if (!store) return false;
  try {
    return (await store.listConversations()).length === 0;
  } catch {
    return false;
  }
}

export function backupFileName(now = new Date()): string {
  return `pulse-backup-${now.toISOString().slice(0, 10)}.pbk`;
}
