import { ACCENTS, LANGUAGES, THEMES } from "@pulse/core";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { usePreferences } from "@/settings/PreferencesProvider";

function Choice({
  label,
  selected,
  accent,
  onPress,
}: {
  label: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]}
    >
      <Text style={selected ? styles.chipTextOn : undefined}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const t = useTranslations();
  const { prefs, language, accentColor, restartRequired, update } = usePreferences();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t("mobile.settings.title")}</Text>

        <Text style={styles.section}>{t("mobile.settings.theme")}</Text>
        <View style={styles.row}>
          {THEMES.map((v) => (
            <Choice
              key={v}
              label={t(`mobile.settings.themes.${v}`)}
              selected={prefs.theme === v}
              accent={accentColor}
              onPress={() => update({ theme: v })}
            />
          ))}
        </View>

        <Text style={styles.section}>{t("mobile.settings.accent")}</Text>
        <View style={styles.row}>
          {ACCENTS.map((v) => (
            <Choice
              key={v}
              label={t(`mobile.settings.accents.${v}`)}
              selected={prefs.accent === v}
              accent={accentColor}
              onPress={() => update({ accent: v })}
            />
          ))}
        </View>

        <Text style={styles.section}>{t("mobile.settings.language")}</Text>
        <View style={styles.row}>
          {LANGUAGES.map((v) => (
            <Choice
              key={v}
              label={t(`mobile.settings.languages.${v}`)}
              selected={language === v}
              accent={accentColor}
              onPress={() => update({ language: v })}
            />
          ))}
        </View>

        {restartRequired ? (
          <Text style={styles.notice} accessibilityRole="alert">
            {t("mobile.settings.restartRequired")}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "600" },
  section: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#999", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipTextOn: { color: "#fff" },
  notice: { marginTop: 16, color: "#b45309" },
});
