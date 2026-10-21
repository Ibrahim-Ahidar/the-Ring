import { isBelowMinimum } from "@pulse/core";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { getMobileCompat } from "@/data";
import { usePreferences } from "@/settings/PreferencesProvider";

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

/** Blocks the whole app when this build is older than the backend minimum. Fails open offline. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { accentColor } = usePreferences();
  const compat = useQuery({
    queryKey: ["mobile-compat"],
    queryFn: async () => {
      const r = await getMobileCompat();
      if (!r.ok) throw new Error(r.error.code);
      return r.value;
    },
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const data = compat.data;
  if (!data || !isBelowMinimum(APP_VERSION, data.minVersion)) return <>{children}</>;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>{t("mobile.update.title")}</Text>
        <Text style={styles.text}>
          {t("mobile.update.body", { current: APP_VERSION, minimum: data.minVersion ?? "" })}
        </Text>
        {data.downloadUrl ? (
          <Pressable
            style={[styles.button, { backgroundColor: accentColor }]}
            onPress={() => void Linking.openURL(data.downloadUrl as string)}
            accessibilityRole="link"
          >
            <Text style={styles.buttonText}>{t("mobile.update.download")}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  body: { gap: 12 },
  title: { fontSize: 28, fontWeight: "600" },
  text: { fontSize: 16 },
  button: { borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
