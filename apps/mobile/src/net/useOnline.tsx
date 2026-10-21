import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { isOnline } from "./connectivity";

/**
 * Feeds the OS connectivity into TanStack Query's onlineManager: queries pause while
 * offline and refetch on reconnect (refetchOnReconnect). Call once at app start.
 */
export function startConnectivityWatch(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnline(state))),
  );
  return () => onlineManager.setEventListener(() => () => {});
}

/** Current connectivity as seen by the query layer. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
