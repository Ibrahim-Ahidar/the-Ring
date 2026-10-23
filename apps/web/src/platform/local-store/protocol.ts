import type { SqlValue } from "@pulse/core/local-store";

/** Messages between the page and the SQLite worker. Every request carries an id the reply echoes. */
export type WorkerRequest =
  | { id: number; op: "exec"; sql: string; params: readonly SqlValue[] }
  | { id: number; op: "query"; sql: string; params: readonly SqlValue[] }
  | { id: number; op: "destroy" };

export type WorkerResponse =
  | { id: number; ok: true; rows?: Record<string, SqlValue>[] }
  | { id: number; ok: false; error: string };

/** The slice of Worker the executor needs, so tests can pass a fake. */
export type WorkerLike = {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message", listener: (event: { data: WorkerResponse }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  terminate(): void;
};
