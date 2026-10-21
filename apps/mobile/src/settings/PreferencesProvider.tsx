import {
  ACCENT_COLORS,
  DEFAULT_PREFERENCES,
  isRtlLanguage,
  resolveLanguage,
  type LanguagePreference,
  type Preferences,
} from "@pulse/core";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, I18nManager } from "react-native";

import { loadPreferences, savePreferences } from "@/data";

interface PreferencesValue {
  prefs: Preferences;
  language: LanguagePreference;
  accentColor: string;
  /** True when the saved language needs the opposite layout direction than the running one. */
  restartRequired: boolean;
  update: (patch: Partial<Preferences>) => void;
}

const Ctx = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPreferences().then((p) => {
      setPrefs(p);
      setReady(true);
    });
  }, []);

  const language = resolveLanguage(prefs.language, getLocales()[0]?.languageCode ?? undefined);
  const wantRtl = isRtlLanguage(language);

  // Direction is read at app start, so it is stored now and takes effect after a restart.
  useEffect(() => {
    if (!ready) return;
    if (I18nManager.isRTL !== wantRtl) {
      I18nManager.allowRTL(wantRtl);
      I18nManager.forceRTL(wantRtl);
    }
  }, [ready, wantRtl]);

  useEffect(() => {
    if (!ready) return;
    Appearance.setColorScheme(prefs.theme === "system" ? "unspecified" : prefs.theme);
  }, [ready, prefs.theme]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({
      prefs,
      language,
      accentColor: ACCENT_COLORS[prefs.accent],
      restartRequired: ready && I18nManager.isRTL !== wantRtl,
      update,
    }),
    [prefs, language, ready, wantRtl, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): PreferencesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePreferences must be used inside PreferencesProvider");
  return v;
}
