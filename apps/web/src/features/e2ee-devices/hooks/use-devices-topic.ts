"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEVICES_CHANGED_EVENT,
  devicesTopic,
  parseDevicesChanged,
  type DevicesChangedPayload,
} from "../devices-changed";

/** Listens for devices_changed on the signed-in user's own private topic (server-sent). */
export function useDevicesTopic(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  onChange: (payload: DevicesChangedPayload) => void,
) {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(devicesTopic(userId), { config: { private: true } })
      .on("broadcast", { event: DEVICES_CHANGED_EVENT }, (msg) => {
        const parsed = parseDevicesChanged((msg as { payload?: unknown }).payload);
        if (parsed) handler.current(parsed);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);
}
