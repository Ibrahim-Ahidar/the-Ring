import { getTranslations } from "next-intl/server";

import { SettingsAppearanceClient } from "@/features/locale-appearance/components/SettingsAppearanceClient";
import { resolveLocale, resolveTheme } from "@/shell/preferences";

export default async function SettingsAppearancePage() {
  const t = await getTranslations("locale-appearance");
  const locale = await resolveLocale();
  const theme = await resolveTheme();

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t("settingsAppearanceTitle")}</h1>
      <SettingsAppearanceClient initialLocale={locale} initialTheme={theme} />
    </div>
  );
}
