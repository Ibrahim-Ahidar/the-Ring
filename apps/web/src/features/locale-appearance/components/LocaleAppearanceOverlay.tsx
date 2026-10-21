"use client";

import { memo } from "react";
import dynamic from "next/dynamic";

import { DEFAULT_LOCALE, isLocale, isTheme } from "@/shell/locale";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import { GlobalKeyboardShortcuts } from "@/features/locale-appearance/components/GlobalKeyboardShortcuts";
import { ShortcutHelpDialog } from "@/features/locale-appearance/components/ShortcutHelpDialog";

// CommandPalette reads the feature registry, which includes this overlay. Loading
// it after the registry initializes prevents that registry/component import cycle.
const CommandPalette = dynamic(
  () =>
    import("@/features/locale-appearance/components/CommandPalette").then(
      (module) => module.CommandPalette,
    ),
  { ssr: false },
);

function readInitialLocale() {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
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
      <CommandPalette />
      <ShortcutHelpDialog />
    </AppearanceProvider>
  );
}

export const LocaleAppearanceOverlay = memo(LocaleAppearanceOverlayInner);
