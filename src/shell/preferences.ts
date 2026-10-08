import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";
import {
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  isLocale,
  isTheme,
  LOCALE_COOKIE,
  THEME_COOKIE,
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
        .select("locale, theme")
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
  column: "locale" | "theme",
  parse: (value: string) => value is T,
): Promise<T | null> {
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
