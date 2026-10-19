import { useEffect, useState } from "react";

import { joinPeerPresence } from "@/platform/realtime-hub";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

/**
 * Whether the peer is online, read from their private presence topic. The
 * server only lets the viewer join it when `presence_allowed` holds (shared
 * conversation, no block, peer's show_online), so a refused join stays false.
 */
export function usePeerOnline(
  peerId: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!peerId || !viewerId || peerId === viewerId) {
      setOnline(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const handle = joinPeerPresence(supabase, peerId, viewerId);
    const removePresence = handle.onPresence((state) => {
      setOnline(Object.keys(state).includes(peerId));
    });
    const removeStatus = handle.onStatus((status) => {
      if (status !== "SUBSCRIBED") setOnline(false);
    });
    return () => {
      removePresence();
      removeStatus();
      handle.leave();
      setOnline(false);
    };
  }, [peerId, viewerId]);

  return online;
}
