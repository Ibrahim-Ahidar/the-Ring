export type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };

/**
 * Online unless the OS says there is no connection. `null` (unknown, e.g. at launch)
 * counts as online so the app does not flash an offline banner before the first probe.
 */
export function isOnline(state: NetState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}
