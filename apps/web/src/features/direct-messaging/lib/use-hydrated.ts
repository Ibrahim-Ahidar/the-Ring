import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server render and hydration, true afterwards. Use it to gate
 * output that depends on the viewer's time zone or the current clock, so the
 * server HTML and the first client render can never disagree.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
