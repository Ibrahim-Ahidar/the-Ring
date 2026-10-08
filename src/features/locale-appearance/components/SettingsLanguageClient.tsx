"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { LocaleOptionList } from "@/features/locale-appearance/components/LocaleOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import type { Locale, Theme } from "@/shell/locale";

type SettingsLanguageClientProps = {
  initialLocale: Locale;
  initialTheme: Theme;
};

function SettingsLanguageClientInner({
  initialLocale,
  initialTheme,
}: SettingsLanguageClientProps) {
  const t = useTranslations("locale-appearance");

  return (
    <AppearanceProvider initialLocale={initialLocale} initialTheme={initialTheme}>
      <div className={styles.settingsPage}>
        <p className={styles.settingsHint}>{t("settingsLanguageHint")}</p>
        <LocaleOptionList />
      </div>
    </AppearanceProvider>
  );
}

export const SettingsLanguageClient = memo(SettingsLanguageClientInner);
