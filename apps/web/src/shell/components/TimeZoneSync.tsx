"use client";

import { useRouter } from "next/navigation";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { useEffect, useState } from "react";

import { TIME_ZONE_COOKIE } from "@/shell/locale";

type Props = {
  /** The zone the server rendered with. */
  timeZone: string;
  children: React.ReactNode;
};

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Formats every date on the client in the device's time zone.
 *
 * The first render uses the server's zone so hydration matches; right after
 * mount the provider switches to the browser's zone. The zone is also stored
 * in a cookie so later server renders already use it.
 */
export function TimeZoneSync({ timeZone, children }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages();
  const [zone, setZone] = useState(timeZone);

  useEffect(() => {
    const browserZone = browserTimeZone();
    if (!browserZone || browserZone === timeZone) {
      return;
    }
    setZone(browserZone);
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(browserZone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router, timeZone]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={zone}>
      {children}
    </NextIntlClientProvider>
  );
}
