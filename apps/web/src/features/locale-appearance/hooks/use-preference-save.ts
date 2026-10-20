"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import {
  saveAccentAction,
  saveLocaleAction,
  saveThemeAction,
} from "@/features/locale-appearance/actions";
import { useAppearanceDispatch } from "@/features/locale-appearance/context/AppearanceContext";
import type { Accent, Locale, Theme } from "@/shell/locale";

export function usePreferenceSave() {
  const router = useRouter();
  const dispatch = useAppearanceDispatch();
  const [pending, startTransition] = useTransition();

  const saveLocale = useCallback(
    (locale: Locale) => {
      startTransition(async () => {
        const result = await saveLocaleAction(locale);
        if (!result.ok) {
          return;
        }
        dispatch({ type: "set_locale", locale });
        router.refresh();
      });
    },
    [dispatch, router],
  );

  const saveTheme = useCallback(
    (theme: Theme) => {
      startTransition(async () => {
        const result = await saveThemeAction(theme);
        if (!result.ok) {
          return;
        }
        dispatch({ type: "set_theme", theme });
        router.refresh();
      });
    },
    [dispatch, router],
  );

  const saveAccent = useCallback(
    (accent: Accent, onFailure?: () => void) => {
      startTransition(async () => {
        const result = await saveAccentAction(accent);
        if (!result.ok) {
          onFailure?.();
          return;
        }
        dispatch({ type: "set_accent", accent });
        router.refresh();
      });
    },
    [dispatch, router],
  );

  return { saveLocale, saveTheme, saveAccent, pending };
}
