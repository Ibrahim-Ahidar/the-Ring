"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TIME_ZONE_COOKIE } from "@/shell/locale";

type Props = {
  /** The zone the server rendered with. */
  timeZone: string;
};

/**
 * Stores the browser's time zone in a cookie so the server renders dates in it.
 * When it differs from what the server used, re-renders with the right zone.
 */
export function TimeZoneSync({ timeZone }: Props) {
  const router = useRouter();

  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === timeZone) {
      return;
    }
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(browserZone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router, timeZone]);

  return null;
}
