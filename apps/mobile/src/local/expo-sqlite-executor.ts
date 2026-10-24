import type { SqlExecutor, SqlValue } from "@pulse/core/local-store";

/** The slice of expo-sqlite's SQLiteDatabase that the executor uses (also what tests fake). */
export interface ExpoDatabaseLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  closeAsync?(): Promise<void>;
}

/** A core SqlExecutor over an expo-sqlite database. Transactions nest by joining the outer one. */
export function createExpoSqliteExecutor(db: ExpoDatabaseLike): SqlExecutor {
  let depth = 0;
  // Top-level transactions run one at a time so two callers never share a BEGIN.
  let tail: Promise<unknown> = Promise.resolve();
  return {
    async exec(sql, params = []) {
      await db.runAsync(sql, [...params]);
    },
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.getAllAsync<T>(sql, [...params]);
    },
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) return fn();
      const run = async () => {
        await db.execAsync("BEGIN");
        depth++;
        try {
          const out = await fn();
          await db.execAsync("COMMIT");
          return out;
        } catch (e) {
          await db.execAsync("ROLLBACK");
          throw e;
        } finally {
          depth--;
        }
      };
      const next = tail.then(run, run);
      tail = next.catch(() => undefined);
      return next;
    },
  };
}
