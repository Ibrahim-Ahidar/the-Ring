import { ACCENTS, THEMES } from "@pulse/core";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { AccentSwatch, OptionCard, OptionCardGrid, SettingsCard, ThemePreview } from "@/settings/OptionCards";
import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Screen, Text, useTheme } from "@/ui";

/** Web /app/settings/appearance: theme cards with previews, then accent swatch cards. */
export default function AppearanceScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing, mode } = useTheme();
  const { prefs, update } = usePreferences();
  return (
    <Screen edges={["start", "end", "bottom"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("routes.settingsAppearance")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      <SettingsCard hint={t("mobile.settings.appearanceHint")}>
        <OptionCardGrid label={t("routes.settingsAppearance")}>
          {THEMES.map((v) => (
            <OptionCard
              key={v}
              label={t(`mobile.settings.themes.${v}`)}
              checked={prefs.theme === v}
              onPress={() => update({ theme: v })}
              preview={<ThemePreview theme={v} accent={prefs.accent} />}
            />
          ))}
        </OptionCardGrid>
        <View style={{ paddingHorizontal: spacing.s16, paddingBottom: spacing.s12 }}>
          <Text variant="caption" tone="textMuted" accessibilityRole="header">
            {t("mobile.settings.accent")}
          </Text>
        </View>
        <OptionCardGrid label={t("mobile.settings.accent")}>
          {ACCENTS.map((v) => (
            <OptionCard
              key={v}
              label={t(`mobile.settings.accents.${v}`)}
              checked={prefs.accent === v}
              onPress={() => update({ accent: v })}
              preview={<AccentSwatch accent={v} mode={mode} />}
            />
          ))}
        </OptionCardGrid>
      </SettingsCard>
    </Screen>
  );
}
