import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server render and hydration, true once React runs in the browser.
 * Forms keep submit disabled until then so a click before the JS loads cannot
 * fall back to a plain HTML submit (which just reloads the page).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
