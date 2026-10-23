/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { SqlValue } from "@pulse/core/local-store";

import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * Dedicated worker that owns the SQLite database. The opfs-sahpool VFS keeps the file in the
 * Origin Private File System and needs neither SharedArrayBuffer nor COOP/COEP headers.
 */
const DB_FILE = "/pulse-local.db";
const POOL_DIRECTORY = "pulse-local-sqlite";

type Db = {
  exec(opts: {
    sql: string;
    bind?: unknown[];
    rowMode?: "object";
    returnValue?: "resultRows";
  }): unknown;
  close(): void;
};
type Pool = {
  OpfsSAHPoolDb: new (filename: string) => Db;
  wipeFiles(): Promise<void>;
  removeVfs(): Promise<boolean>;
};

let ready: Promise<{ db: Db; pool: Pool }> | null = null;

function open() {
  ready ??= (async () => {
    const sqlite3 = await sqlite3InitModule();
    const pool = (await sqlite3.installOpfsSAHPoolVfs({
      directory: POOL_DIRECTORY,
    })) as unknown as Pool;
    const db = new pool.OpfsSAHPoolDb(DB_FILE);
    db.exec({ sql: "PRAGMA journal_mode = WAL" });
    db.exec({ sql: "PRAGMA foreign_keys = ON" });
    return { db, pool };
  })();
  return ready;
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    const { db, pool } = await open();
    if (req.op === "exec") {
      db.exec({ sql: req.sql, bind: [...req.params] });
      return { id: req.id, ok: true };
    }
    if (req.op === "query") {
      const rows = db.exec({
        sql: req.sql,
        bind: [...req.params],
        rowMode: "object",
        returnValue: "resultRows",
      }) as Record<string, SqlValue>[];
      return { id: req.id, ok: true, rows };
    }
    db.close();
    await pool.wipeFiles();
    await pool.removeVfs();
    ready = null;
    return { id: req.id, ok: true };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data).then((res) => self.postMessage(res));
});
