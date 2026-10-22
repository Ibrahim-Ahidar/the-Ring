import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import { AppHeader, Screen, Text, useTheme } from "@/ui";

type Section = { title: string; body: string };

/** Mirrors the web LegalPage: the terms or privacy copy from the shell catalog. */
export default function LegalScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind = raw === "privacy" ? "privacy" : "terms";
  const sections = t.raw(`legal.${kind}.sections`) as Section[];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen edges={["start", "end"]} background="bg">
      <AppHeader title={t(`routes.${kind}`)} onBack={back} backLabel={t("public.back")} />
      <ScrollView contentContainerStyle={{ padding: spacing.s16, paddingBottom: spacing.s32, gap: spacing.s16 }}>
        <Text variant="title" accessibilityRole="header">
          {t(`routes.${kind}`)}
        </Text>
        <Text>{t(`legal.${kind}.intro`)}</Text>
        {sections.map((section) => (
          <View key={section.title} style={{ gap: spacing.s8 }}>
            <Text variant="bodyStrong" accessibilityRole="header">
              {section.title}
            </Text>
            <Text tone="textMuted">{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
