"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  appearanceReducer,
  initialAppearanceState,
  type AppearanceAction,
  type AppearanceState,
} from "@/features/locale-appearance/context/appearance-reducer";
import type { Accent, Locale, Theme } from "@/shell/locale";

type AppearanceContextValue = {
  state: AppearanceState;
  dispatch: (action: AppearanceAction) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

type AppearanceProviderProps = {
  initialLocale: Locale;
  initialTheme: Theme;
  initialAccent?: Accent;
  children: ReactNode;
};

export function AppearanceProvider({
  initialLocale,
  initialTheme,
  initialAccent,
  children,
}: AppearanceProviderProps) {
  const [state, dispatch] = useReducer(
    appearanceReducer,
    initialAppearanceState(initialLocale, initialTheme, initialAccent),
  );

  const value = useMemo(
    () => ({ state, dispatch }),
    [state],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}

export function useAppearanceDispatch(): (action: AppearanceAction) => void {
  return useAppearance().dispatch;
}
