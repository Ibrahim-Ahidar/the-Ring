import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { usePreferences } from "@/settings/PreferencesProvider";

import { createTheme, type Theme } from "./theme";

const Ctx = createContext<Theme | null>(null);

/**
 * Resolves the theme from the saved preference. PreferencesProvider pins the OS
 * color scheme for light/dark, so useColorScheme() already reflects system/light/dark.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePreferences();
  const scheme = useColorScheme();
  const theme = useMemo(
    () => createTheme(scheme === "dark" ? "dark" : "light", prefs.accent),
    [scheme, prefs.accent],
  );
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
