/**
 * Desktop local database (spec D11, issue #219): a SQLite file opened in the Electron main
 * process with better-sqlite3-multiple-ciphers (SQLCipher mode). The page reaches it only
 * through one narrow IPC request: exec / query / destroy. Transactions are BEGIN/COMMIT
 * statements sequenced by the page, exactly as for the OPFS worker.
 */
import { LOCAL_KEY_BYTES } from "./local-storage-key";

export type SqlValue = string | number | null | Uint8Array;

export type LocalDbRequest =
  | { op: "exec"; sql: string; params: SqlValue[] }
  | { op: "query"; sql: string; params: SqlValue[] }
  | { op: "destroy" };

export type LocalDbResponse =
  | { ok: true; rows?: Record<string, SqlValue>[] }
  | { ok: false; error: string };

export const MAX_SQL = 100_000;
export const MAX_PARAMS = 999;

/** The slice of better-sqlite3 the service uses, so tests can pass a fake or a temp database. */
export type DbDriver = {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  pragma(source: string): unknown;
  close(): void;
};

function isSqlValue(v: unknown): v is SqlValue {
  return v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v)) || v instanceof Uint8Array;
}

/** Validates an untrusted request from the renderer; null when invalid. */
export function parseLocalDbRequest(raw: unknown): LocalDbRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.op === "destroy") return { op: "destroy" };
  if (r.op !== "exec" && r.op !== "query") return null;
  if (typeof r.sql !== "string" || r.sql.length === 0 || r.sql.length > MAX_SQL) return null;
  const params = r.params ?? [];
  if (!Array.isArray(params) || params.length > MAX_PARAMS || !params.every(isSqlValue)) return null;
  return { op: r.op, sql: r.sql, params: params as SqlValue[] };
}

export type LocalDbServiceDeps = {
  /** Path of the database file. */
  file: string;
  /** Base64 32-byte key from safeStorage, or null when the OS cannot protect it. */
  getKey(): string | null;
  /** Deletes the stored key (logout). */
  deleteKey(): void;
  open(file: string): DbDriver;
  removeFile(path: string): void;
};

export type LocalDbService = {
  handle(raw: unknown): LocalDbResponse;
  close(): void;
};

/** Opens an encrypted database: key first, then pragmas. */
export function openEncrypted(driver: DbDriver, keyBase64: string): void {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== LOCAL_KEY_BYTES) throw new Error("invalid local storage key");
  driver.pragma("cipher = 'sqlcipher'");
  driver.pragma(`key = "x'${key.toString("hex")}'"`);
  driver.pragma("journal_mode = WAL");
  driver.pragma("foreign_keys = ON");
  // Fails here, not later, when the key does not match the file.
  driver.prepare("SELECT count(*) FROM sqlite_master").all();
}

export function createLocalDbService(deps: LocalDbServiceDeps): LocalDbService {
  let db: DbDriver | null = null;

  function ensureOpen(): DbDriver {
    if (db) return db;
    const key = deps.getKey();
    if (!key) throw new Error("local storage key unavailable");
    const driver = deps.open(deps.file);
    try {
      openEncrypted(driver, key);
    } catch (e) {
      driver.close();
      throw e;
    }
    db = driver;
    return driver;
  }

  function close(): void {
    try {
      db?.close();
    } finally {
      db = null;
    }
  }

  return {
    close,
    handle(raw) {
      const req = parseLocalDbRequest(raw);
      if (!req) return { ok: false, error: "invalid local database request" };
      try {
        if (req.op === "destroy") {
          close();
          for (const suffix of ["", "-wal", "-shm", "-journal"]) deps.removeFile(deps.file + suffix);
          deps.deleteKey();
          return { ok: true };
        }
        const stmt = ensureOpen().prepare(req.sql);
        if (req.op === "exec") {
          stmt.run(...req.params);
          return { ok: true };
        }
        return { ok: true, rows: stmt.all(...req.params) as Record<string, SqlValue>[] };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
