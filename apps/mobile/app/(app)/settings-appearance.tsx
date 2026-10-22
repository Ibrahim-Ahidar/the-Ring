import { ACCENTS, THEMES } from "@pulse/core";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Icon, ListRow, Screen, SectionHeader, useTheme } from "@/ui";

/** Web /app/settings/appearance: theme and accent pickers. */
export default function AppearanceScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { prefs, update } = usePreferences();
  return (
    <Screen edges={["start", "end", "bottom"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("routes.settingsAppearance")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      <SectionHeader title={t("mobile.settings.theme")} />
      <View style={{ paddingHorizontal: spacing.s8 }}>
        {THEMES.map((v) => (
          <ListRow
            key={v}
            title={t(`mobile.settings.themes.${v}`)}
            selected={prefs.theme === v}
            trailing={prefs.theme === v ? <Icon icon={Check} tone="accent" /> : null}
            onPress={() => update({ theme: v })}
          />
        ))}
      </View>
      <SectionHeader title={t("mobile.settings.accent")} />
      <View style={{ paddingHorizontal: spacing.s8 }}>
        {ACCENTS.map((v) => (
          <ListRow
            key={v}
            title={t(`mobile.settings.accents.${v}`)}
            selected={prefs.accent === v}
            trailing={prefs.accent === v ? <Icon icon={Check} tone="accent" /> : null}
            onPress={() => update({ accent: v })}
          />
        ))}
      </View>
    </Screen>
  );
}
