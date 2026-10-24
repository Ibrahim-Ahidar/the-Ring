"use client";

import { useEffect, useMemo, useState } from "react";

import { asRpcClient } from "@pulse/core/rpc";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import {
  announceDevicesChanged,
  type BroadcastClient,
  type DevicesChangeKind,
} from "../devices-changed";

/** Random per tab, so a tab does not alert itself about its own changes. */
export const TAB_ORIGIN =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());

export function useDevicesSession() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const rpc = useMemo(() => asRpcClient(supabase), [supabase]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (live) setUserId(data.user?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  function announce(kind: DevicesChangeKind) {
    if (!userId) return;
    void announceDevicesChanged(supabase as unknown as BroadcastClient, {
      userId,
      kind,
      origin: TAB_ORIGIN,
      at: Date.now(),
    });
  }

  return { supabase, rpc, userId, announce };
}
