import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";
import {
  ACCENT_COOKIE,
  DEFAULT_ACCENT,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  DEFAULT_TIME_ZONE,
  isAccent,
  isLocale,
  isTheme,
  isTimeZone,
  LOCALE_COOKIE,
  THEME_COOKIE,
  TIME_ZONE_COOKIE,
  type Accent,
  type Locale,
  type Theme,
} from "@/shell/locale";

const readProfilePreferences = cache(
  async (): Promise<Record<string, unknown> | null> => {
    const supabase = await tryCreateSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("locale, theme, accent")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      return null;
    }
  },
);

async function readProfilePreference<T extends string>(
  column: "locale" | "theme" | "accent",
  parse: (value: string) => value is T,
): Promise<T | null> {
  // Cookie first: skips an auth call plus a profiles query on every render.
  const cookieStore = await cookies();
  const cookieName =
    column === "locale" ? LOCALE_COOKIE : column === "theme" ? THEME_COOKIE : ACCENT_COOKIE;
  const cookieValue = cookieStore.get(cookieName)?.value;
  if (cookieValue && parse(cookieValue)) {
    return cookieValue;
  }
  const row = await readProfilePreferences();
  const value = row?.[column];
  if (typeof value === "string" && parse(value)) {
    return value;
  }
  return null;
}

export async function resolveLocale(): Promise<Locale> {
  const fromProfile = await readProfilePreference("locale", isLocale);
  if (fromProfile) {
    return fromProfile;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }

  return DEFAULT_LOCALE;
}

export async function resolveTheme(): Promise<Theme> {
  const fromProfile = await readProfilePreference("theme", isTheme);
  if (fromProfile) {
    return fromProfile;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(THEME_COOKIE)?.value;
  if (cookieValue && isTheme(cookieValue)) {
    return cookieValue;
  }

  return DEFAULT_THEME;
}

export async function resolveAccent(): Promise<Accent> {
  const fromProfile = await readProfilePreference("accent", isAccent);
  if (fromProfile) {
    return fromProfile;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACCENT_COOKIE)?.value;
  if (cookieValue && isAccent(cookieValue)) {
    return cookieValue;
  }

  return DEFAULT_ACCENT;
}

/**
 * The viewer's IANA time zone, as reported by the browser (see `TimeZoneSync`).
 * Server and client must format dates in the same zone or hydration fails.
 */
export async function resolveTimeZone(): Promise<string> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(TIME_ZONE_COOKIE)?.value;
  if (cookieValue && isTimeZone(cookieValue)) {
    return cookieValue;
  }
  return DEFAULT_TIME_ZONE;
}
