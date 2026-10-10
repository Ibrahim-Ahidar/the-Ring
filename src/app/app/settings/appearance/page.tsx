import { getTranslations } from "next-intl/server";

import { SettingsAppearanceClient } from "@/features/locale-appearance/components/SettingsAppearanceClient";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { resolveLocale, resolveTheme } from "@/shell/preferences";

export default async function SettingsAppearancePage() {
  const t = await getTranslations("locale-appearance");
  const locale = await resolveLocale();
  const theme = await resolveTheme();

  return (
    <SettingsSection title={t("settingsAppearanceTitle")}>
      <SettingsAppearanceClient initialLocale={locale} initialTheme={theme} />
    </SettingsSection>
  );
}
