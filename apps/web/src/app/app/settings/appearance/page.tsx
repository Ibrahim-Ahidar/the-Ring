import { getTranslations } from "next-intl/server";

import { SettingsAppearanceClient } from "@/features/locale-appearance/components/SettingsAppearanceClient";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { resolveAccent, resolveLocale, resolveTheme } from "@/shell/preferences";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("settingsAppearance");

export default async function SettingsAppearancePage() {
  const t = await getTranslations("locale-appearance");
  const locale = await resolveLocale();
  const theme = await resolveTheme();
  const accent = await resolveAccent();

  return (
    <SettingsSection title={t("settingsAppearanceTitle")}>
      <SettingsAppearanceClient initialLocale={locale} initialTheme={theme}
        initialAccent={accent}
      />
    </SettingsSection>
  );
}
