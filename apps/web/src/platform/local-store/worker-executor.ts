import type { SqlExecutor, SqlValue } from "@pulse/core/local-store";

import type { WorkerLike, WorkerRequest, WorkerResponse } from "./protocol";

export type WorkerExecutor = SqlExecutor & {
  /** Closes the database, deletes its files and stops the worker. */
  destroy(): Promise<void>;
};

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/**
 * A SqlExecutor that forwards every statement to the SQLite worker. Requests run one at a
 * time through a queue, so statements from different callers never interleave inside the
 * worker except within a transaction, which holds the queue until it commits.
 */
export function createWorkerExecutor(worker: WorkerLike): WorkerExecutor {
  const pending = new Map<
    number,
    { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }
  >();
  let nextId = 1;

  worker.addEventListener("message", (event) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.resolve(event.data);
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message ?? "local database worker failed");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  });

  function send(req: DistributiveOmit<WorkerRequest, "id">): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async function call(req: DistributiveOmit<WorkerRequest, "id">) {
    const res = await send(req);
    if (!res.ok) throw new Error(res.error);
    return res.rows ?? [];
  }

  // Serializes top-level work. A transaction owns the lane until it ends; statements issued
  // while it runs (its own body) bypass the lane via `inTransaction`.
  let lane: Promise<unknown> = Promise.resolve();
  let inTransaction = false;
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = lane.then(job, job);
    lane = run.catch(() => undefined);
    return run;
  };

  return {
    exec(sql, params = []) {
      const job = async () => void (await call({ op: "exec", sql, params }));
      return inTransaction ? job() : enqueue(job);
    },
    query<T>(sql: string, params: readonly SqlValue[] = []) {
      const job = async () => (await call({ op: "query", sql, params })) as T[];
      return inTransaction ? job() : enqueue(job);
    },
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (inTransaction) return fn();
      return enqueue(async () => {
        inTransaction = true;
        try {
          await call({ op: "exec", sql: "BEGIN", params: [] });
          try {
            const out = await fn();
            await call({ op: "exec", sql: "COMMIT", params: [] });
            return out;
          } catch (e) {
            await call({ op: "exec", sql: "ROLLBACK", params: [] }).catch(() => undefined);
            throw e;
          }
        } finally {
          inTransaction = false;
        }
      });
    },
    async destroy() {
      await enqueue(() => call({ op: "destroy" })).catch(() => undefined);
      worker.terminate();
    },
  };
}
