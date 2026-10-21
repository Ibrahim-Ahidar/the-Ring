"use client";

import { useEffect, useMemo } from "react";

import { asRpcClient } from "@pulse/core/rpc";
import { joinOwnPresence } from "@/platform/realtime-hub";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { touchLastSeenForMember } from "@/features/typing-presence/service";

const PRESENCE_HEARTBEAT_MS = 30_000;
const HIDDEN_UNTRACK_MS = 30_000;

/** Mounted once in the shell: tracks the viewer on their own private presence topic. */
export function GlobalPresence() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const rpc = useMemo(() => asRpcClient(supabase), [supabase]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    function start(viewerId: string): () => void {
      const handle = joinOwnPresence(supabase, viewerId);
      let subscribed = false;
      let tracked = false;
      let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

      const touch = () => {
        // Peers read online from this heartbeat while realtime joins fail (#154).
        if (document.visibilityState === "hidden") return;
        void touchLastSeenForMember(rpc);
      };
      const track = () => {
        if (!subscribed || tracked || disposed) {
          return;
        }
        tracked = true;
        void handle.track({ online: true, at: Date.now() });
      };
      const untrack = () => {
        if (!tracked) {
          return;
        }
        tracked = false;
        void handle.untrack();
      };

      const removeStatus = handle.onStatus((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          tracked = false;
          if (document.visibilityState !== "hidden") {
            track();
          }
          touch();
          return;
        }
        subscribed = false;
        tracked = false;
      });

      const onPageHide = () => untrack();
      const onPageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          track();
        }
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          if (hiddenTimer === null) {
            hiddenTimer = setTimeout(() => {
              hiddenTimer = null;
              untrack();
            }, HIDDEN_UNTRACK_MS);
          }
          return;
        }
        if (hiddenTimer !== null) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        track();
        touch();
      };

      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("pageshow", onPageShow);
      document.addEventListener("visibilitychange", onVisibility);

      touch();
      const heartbeat = window.setInterval(touch, PRESENCE_HEARTBEAT_MS);

      return () => {
        window.clearInterval(heartbeat);
        if (hiddenTimer !== null) {
          clearTimeout(hiddenTimer);
        }
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
        document.removeEventListener("visibilitychange", onVisibility);
        removeStatus();
        untrack();
        handle.leave();
      };
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (disposed || !data.user) {
        return;
      }
      cleanup = start(data.user.id);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [supabase, rpc]);

  return null;
}
