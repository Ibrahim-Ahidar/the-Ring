import { useEffect, useMemo, useState } from "react";

import { asRpcClient } from "@/platform/rpc";
import { joinPeerPresence } from "@/platform/realtime-hub";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { fetchPeerOnline } from "@/features/typing-presence/service";

const PEER_POLL_MS = 30_000;

/**
 * Whether the peer is online: their private presence topic, or a heartbeat
 * under 90 s old (`presence_peer_online`), since realtime joins can be refused
 * server-side. Both apply the same gate (shared conversation, no block, the
 * peer's show_online).
 */
export function usePeerOnline(
  peerId: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  const [realtimeOnline, setRealtimeOnline] = useState(false);
  const [polledOnline, setPolledOnline] = useState(false);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!peerId || !viewerId || peerId === viewerId) {
      setRealtimeOnline(false);
      return;
    }
    const handle = joinPeerPresence(supabase, peerId, viewerId);
    const removePresence = handle.onPresence((state) => {
      setRealtimeOnline(Object.keys(state).includes(peerId));
    });
    const removeStatus = handle.onStatus((status) => {
      if (status !== "SUBSCRIBED") setRealtimeOnline(false);
    });
    return () => {
      removePresence();
      removeStatus();
      handle.leave();
      setRealtimeOnline(false);
    };
  }, [peerId, viewerId, supabase]);

  useEffect(() => {
    if (!peerId || !viewerId || peerId === viewerId) {
      setPolledOnline(false);
      return;
    }
    const rpc = asRpcClient(supabase);
    let cancelled = false;
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      void fetchPeerOnline(rpc, peerId).then((result) => {
        if (!cancelled && result.ok) setPolledOnline(result.value === true);
      });
    };
    poll();
    const timer = window.setInterval(poll, PEER_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
      setPolledOnline(false);
    };
  }, [peerId, viewerId, supabase]);

  return realtimeOnline || polledOnline;
}
