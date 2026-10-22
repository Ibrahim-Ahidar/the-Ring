import { LANGUAGES } from "@pulse/core";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Banner, Icon, ListRow, Screen, useTheme } from "@/ui";

/** Web /app/settings/language. */
export default function LanguageScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { language, restartRequired, update } = usePreferences();
  return (
    <Screen edges={["start", "end", "bottom"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("routes.settingsLanguage")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {restartRequired ? <Banner kind="info" message={t("mobile.settings.restartRequired")} /> : null}
      <View style={{ padding: spacing.s8 }}>
        {LANGUAGES.map((v) => (
          <ListRow
            key={v}
            title={t(`mobile.settings.languages.${v}`)}
            selected={language === v}
            trailing={language === v ? <Icon icon={Check} tone="accent" /> : null}
            onPress={() => update({ language: v })}
          />
        ))}
      </View>
    </Screen>
  );
}
