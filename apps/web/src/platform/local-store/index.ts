import { createSqlLocalStore, isE2eeEnabled, type LocalStore } from "@pulse/core";

import type { WorkerExecutor } from "./worker-executor";
import { createWorkerExecutor } from "./worker-executor";

export { createWorkerExecutor } from "./worker-executor";

type Handle = { store: LocalStore; executor: WorkerExecutor };

let handle: Promise<Handle> | null = null;
let persistRequested = false;

function requestPersistence() {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    // persistence is a hint; the store works without it
  }
}

async function openHandle(): Promise<Handle> {
  requestPersistence();
  const worker = new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module" });
  const executor = createWorkerExecutor(worker);
  const store = createSqlLocalStore(executor);
  await store.init();
  return { store, executor };
}

/** The browser's local database, or null when the e2ee flag is off or OPFS is unavailable. */
export function getLocalStore(): Promise<LocalStore | null> {
  if (!isE2eeEnabled() || typeof Worker === "undefined") return Promise.resolve(null);
  handle ??= openHandle();
  return handle.then(
    (h) => h.store,
    () => {
      handle = null;
      return null;
    },
  );
}

/** The executor behind the local store (outbox needs transactions), or null when unavailable. */
export async function getLocalDb(): Promise<{ store: LocalStore; db: WorkerExecutor } | null> {
  const store = await getLocalStore();
  if (!store || !handle) return null;
  try {
    const h = await handle;
    return { store: h.store, db: h.executor };
  } catch {
    return null;
  }
}

/** Logout: delete the local database file. A later getLocalStore() starts a fresh one. */
export async function deleteLocalDatabase(): Promise<void> {
  if (!handle) {
    // Nothing opened in this tab; open once so the files of an earlier session are removed too.
    if (!isE2eeEnabled() || typeof Worker === "undefined") return;
    handle = openHandle();
  }
  const current = handle;
  handle = null;
  try {
    const h = await current;
    await h.store.wipe();
    await h.executor.destroy();
  } catch {
    // opening failed: there is nothing to delete
  }
}
