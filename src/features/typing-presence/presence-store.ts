import { useSyncExternalStore } from "react";

let online: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/** Replaces the app-wide online set; no-op (no re-render) when unchanged. */
export function setOnlineUserIds(ids: ReadonlySet<string>): void {
  if (ids.size === online.size && [...ids].every((id) => online.has(id))) {
    return;
  }
  online = ids;
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Raw presence only; callers must still gate on the subject's `presence_allowed`. */
export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? online.has(userId) : false),
    () => false,
  );
}
