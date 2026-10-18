"use server";

import { cookies } from "next/headers";

import { getSessionContext } from "@/platform/session";
import type { Result } from "@/platform/result";
import {
  ACCENT_COOKIE,
  LOCALE_COOKIE,
  THEME_COOKIE,
  isAccent,
  isLocale,
  isTheme,
  type Accent,
  type Locale,
  type Theme,
} from "@/shell/locale";

import { updateAccent, updateLocale, updateTheme } from "@/features/locale-appearance/service";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

async function setLocaleCookie(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
}

async function setThemeCookie(theme: Theme): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
}

async function setAccentCookie(accent: Accent): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACCENT_COOKIE, accent, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function saveLocaleAction(
  locale: string,
): Promise<Result<null>> {
  if (!isLocale(locale)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }

  const session = await getSessionContext();
  if (session) {
    const result = await updateLocale(session.rpc, locale);
    if (!result.ok) {
      return result;
    }
  }

  await setLocaleCookie(locale);
  return { ok: true, value: null };
}

export async function saveThemeAction(theme: string): Promise<Result<null>> {
  if (!isTheme(theme)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }

  const session = await getSessionContext();
  if (session) {
    const result = await updateTheme(session.rpc, theme);
    if (!result.ok) {
      return result;
    }
  }

  await setThemeCookie(theme);
  return { ok: true, value: null };
}

export async function saveAccentAction(accent: string): Promise<Result<null>> {
  if (!isAccent(accent)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }

  const session = await getSessionContext();
  if (session) {
    const result = await updateAccent(session.rpc, accent);
    if (!result.ok) {
      return result;
    }
  }

  await setAccentCookie(accent);
  return { ok: true, value: null };
}
