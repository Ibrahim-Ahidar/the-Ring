"use client";

import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { getAudioPlayedCountAction } from "../actions";

/** For the sender's own voice message: has any visible recipient played it? */
export function useAudioPlayed(messageId: string, enabled: boolean): boolean {
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void getAudioPlayedCountAction({ messageId }).then((result) => {
        if (!cancelled && result.ok && result.value > 0) {
          setPlayed(true);
        }
      });
    };
    refresh();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`audio-plays:${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_audio_plays",
          filter: `message_id=eq.${messageId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [messageId, enabled]);

  return played;
}
