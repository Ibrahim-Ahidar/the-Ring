"use client";

import { useTranslations } from "next-intl";

import { LocaleOptionList } from "@/features/locale-appearance/components/LocaleOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";
import type { Locale, Theme } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

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
      <section className={ui.settingsCard}>
        <div className={ui.settingsCardHead}>
          <p className={ui.settingsCardDesc}>{t("settingsLanguageHint")}</p>
        </div>
        <LocaleOptionList />
      </section>
    </AppearanceProvider>
  );
}

export const SettingsLanguageClient = SettingsLanguageClientInner;
