"use client";

import { memo } from "react";

import { isLocale, isTheme } from "@/shell/locale";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import { CommandPalette } from "@/features/locale-appearance/components/CommandPalette";
import { GlobalKeyboardShortcuts } from "@/features/locale-appearance/components/GlobalKeyboardShortcuts";
import { QuickPreferencesBar } from "@/features/locale-appearance/components/QuickPreferencesBar";
import { ShortcutHelpDialog } from "@/features/locale-appearance/components/ShortcutHelpDialog";

function readInitialLocale() {
  if (typeof document === "undefined") {
    return "ar" as const;
  }
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : "ar";
}

function readInitialTheme() {
  if (typeof document === "undefined") {
    return "system" as const;
  }
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  return isTheme(theme) ? theme : "system";
}

function LocaleAppearanceOverlayInner() {
  return (
    <AppearanceProvider
      initialLocale={readInitialLocale()}
      initialTheme={readInitialTheme()}
    >
      <GlobalKeyboardShortcuts />
      <QuickPreferencesBar />
      <CommandPalette />
      <ShortcutHelpDialog />
    </AppearanceProvider>
  );
}

export const LocaleAppearanceOverlay = memo(LocaleAppearanceOverlayInner);
