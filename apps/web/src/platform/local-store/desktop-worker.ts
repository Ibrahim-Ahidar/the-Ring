import type { DesktopBridge } from "../desktop-bridge";
import type { WorkerLike, WorkerRequest, WorkerResponse } from "./protocol";

type BridgeDb = NonNullable<DesktopBridge["localDb"]>;

/**
 * Makes the desktop bridge look like the OPFS worker, so the same executor and queue sit on
 * top of both. The main process owns the SQLite file; `terminate` has nothing to stop.
 */
export function createBridgeWorker(localDb: BridgeDb): WorkerLike {
  let onMessage: ((event: { data: WorkerResponse }) => void) | null = null;
  let onError: ((event: { message?: string }) => void) | null = null;
  return {
    postMessage(message: WorkerRequest) {
      const { id, ...req } = message;
      localDb.request(req).then(
        (res) => {
          const r = (res ?? {}) as { ok?: boolean; rows?: never; error?: string };
          const data: WorkerResponse = r.ok
            ? { id, ok: true, rows: r.rows }
            : { id, ok: false, error: r.error ?? "local database request failed" };
          onMessage?.({ data });
        },
        (e: unknown) => onMessage?.({ data: { id, ok: false, error: String(e) } }),
      );
    },
    addEventListener(type: string, listener: never) {
      if (type === "message") onMessage = listener;
      else onError = listener;
    },
    terminate() {
      onError = null;
    },
  } as WorkerLike;
}
