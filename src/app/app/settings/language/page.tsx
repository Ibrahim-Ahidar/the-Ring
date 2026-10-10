import { getTranslations } from "next-intl/server";

import { SettingsLanguageClient } from "@/features/locale-appearance/components/SettingsLanguageClient";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { resolveLocale, resolveTheme } from "@/shell/preferences";

export default async function SettingsLanguagePage() {
  const t = await getTranslations("locale-appearance");
  const locale = await resolveLocale();
  const theme = await resolveTheme();

  return (
    <SettingsSection title={t("settingsLanguageTitle")}>
      <SettingsLanguageClient initialLocale={locale} initialTheme={theme} />
    </SettingsSection>
  );
}
