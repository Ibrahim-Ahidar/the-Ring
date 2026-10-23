import { DatabaseSync } from "node:sqlite";

import type { SqlExecutor, SqlValue } from "./types";

/** Test helper: a SqlExecutor over the SQLite built into Node 22.5+. Not exported from the package index. */
export function createNodeSqliteExecutor(path = ":memory:"): SqlExecutor & { close(): void } {
  const db = new DatabaseSync(path);
  let depth = 0;
  return {
    async exec(sql, params = []) {
      db.prepare(sql).run(...(params as SqlValue[]));
    },
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...(params as SqlValue[])) as T[];
    },
    async transaction(fn) {
      if (depth > 0) return fn();
      db.exec("BEGIN");
      depth++;
      try {
        const out = await fn();
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
    close() {
      db.close();
    },
  };
}
