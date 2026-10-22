import { LANGUAGES } from "@pulse/core";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { Radio, SettingsCard } from "@/settings/OptionCards";
import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Banner, Screen, Text, useTheme } from "@/ui";

/** Web /app/settings/language: radio rows with the autonym and, when it differs, the translated name. */
export default function LanguageScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { language, restartRequired, update } = usePreferences();
  return (
    <Screen edges={["start", "end", "bottom"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("routes.settingsLanguage")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {restartRequired ? <Banner kind="info" message={t("mobile.settings.restartRequired")} /> : null}
      <SettingsCard hint={t("mobile.settings.languageHint")}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t("routes.settingsLanguage")}>
          {LANGUAGES.map((v) => {
            const checked = language === v;
            const autonym = t(`mobile.settings.languages.${v}`);
            const translated = t(`mobile.settings.languageNames.${v}`);
            return (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                onPress={() => update({ language: v })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.s16,
                  paddingVertical: spacing.s12,
                  paddingHorizontal: spacing.s16,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Radio checked={checked} />
                <View style={{ flex: 1 }}>
                  <Text>{autonym}</Text>
                  {translated !== autonym ? (
                    <Text variant="caption" tone="textMuted">
                      {translated}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </SettingsCard>
    </Screen>
  );
}
