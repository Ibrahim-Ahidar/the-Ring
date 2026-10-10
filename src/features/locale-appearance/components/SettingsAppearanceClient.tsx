"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { ThemeOptionList } from "@/features/locale-appearance/components/ThemeOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import type { Locale, Theme } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

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
      <section className={ui.settingsCard}>
        <div className={ui.settingsCardHead}>
          <p className={ui.settingsCardDesc}>{t("settingsAppearanceHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <ThemeOptionList />
        </div>
      </section>
    </AppearanceProvider>
  );
}

export const SettingsAppearanceClient = memo(SettingsAppearanceClientInner);
