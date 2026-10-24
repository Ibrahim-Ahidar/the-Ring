"use client";

import { useEffect, useMemo, useState } from "react";

import { asRpcClient } from "@pulse/core/rpc";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

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

  return { supabase, rpc, userId };
}
