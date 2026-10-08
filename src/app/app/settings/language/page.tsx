import { getTranslations } from "next-intl/server";

import { SettingsLanguageClient } from "@/features/locale-appearance/components/SettingsLanguageClient";
import { resolveLocale, resolveTheme } from "@/shell/preferences";

export default async function SettingsLanguagePage() {
  const t = await getTranslations("locale-appearance");
  const locale = await resolveLocale();
  const theme = await resolveTheme();

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t("settingsLanguageTitle")}</h1>
      <SettingsLanguageClient initialLocale={locale} initialTheme={theme} />
    </div>
  );
}
