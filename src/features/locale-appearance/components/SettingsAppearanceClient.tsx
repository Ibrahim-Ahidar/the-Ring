"use client";

import { useTranslations } from "next-intl";

import { AccentOptionList } from "@/features/locale-appearance/components/AccentOptionList";
import { ThemeOptionList } from "@/features/locale-appearance/components/ThemeOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import type { Accent, Locale, Theme } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

type SettingsAppearanceClientProps = {
  initialLocale: Locale;
  initialTheme: Theme;
  initialAccent: Accent;
};

function SettingsAppearanceClientInner({
  initialLocale,
  initialTheme,
  initialAccent,
}: SettingsAppearanceClientProps) {
  const t = useTranslations("locale-appearance");

  return (
    <AppearanceProvider initialLocale={initialLocale} initialTheme={initialTheme}
      initialAccent={initialAccent}
    >
      <section className={ui.settingsCard}>
        <div className={ui.settingsCardHead}>
          <p className={ui.settingsCardDesc}>{t("settingsAppearanceHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <ThemeOptionList />
        </div>
        <div className={ui.settingsCardBody}>
          <h3 className={ui.settingsCardDesc}>{t("accentTitle")}</h3>
          <AccentOptionList />
        </div>
      </section>
    </AppearanceProvider>
  );
}

export const SettingsAppearanceClient = SettingsAppearanceClientInner;
