"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { ThemeOptionList } from "@/features/locale-appearance/components/ThemeOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import type { Locale, Theme } from "@/shell/locale";

type SettingsAppearanceClientProps = {
  initialLocale: Locale;
  initialTheme: Theme;
};

function SettingsAppearanceClientInner({
  initialLocale,
  initialTheme,
}: SettingsAppearanceClientProps) {
  const t = useTranslations("locale-appearance");

  return (
    <AppearanceProvider initialLocale={initialLocale} initialTheme={initialTheme}>
      <div className={styles.settingsPage}>
        <p className={styles.settingsHint}>{t("settingsAppearanceHint")}</p>
        <ThemeOptionList />
      </div>
    </AppearanceProvider>
  );
}

export const SettingsAppearanceClient = memo(SettingsAppearanceClientInner);
