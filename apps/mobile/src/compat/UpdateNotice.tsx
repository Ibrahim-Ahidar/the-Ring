import { isBelowMinimum, isUpdateAvailable } from "@pulse/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { getMobileCompat } from "@/data";
import { usePreferences } from "@/settings/PreferencesProvider";

import { APP_VERSION } from "./UpdateGate";

/** Dismissible banner shown when a newer (but not required) release exists. */
export function UpdateNotice() {
  const t = useTranslations();
  const { accentColor } = usePreferences();
  const [dismissed, setDismissed] = useState(false);
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
  if (dismissed || !data || !isUpdateAvailable(APP_VERSION, data.latestVersion)) return null;
  if (isBelowMinimum(APP_VERSION, data.minVersion)) return null;

  return (
    <View style={[styles.bar, { borderColor: accentColor }]} accessibilityRole="alert">
      <Text style={styles.text}>
        {t("mobile.update.notice", { latest: data.latestVersion ?? "", current: APP_VERSION })}
      </Text>
      <View style={styles.actions}>
        {data.downloadUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(data.downloadUrl as string)}
            accessibilityRole="link"
          >
            <Text style={[styles.action, { color: accentColor }]}>{t("mobile.update.download")}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setDismissed(true)} accessibilityRole="button">
          <Text style={styles.action}>{t("mobile.update.dismiss")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 2, paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  text: { fontSize: 14 },
  actions: { flexDirection: "row", gap: 16 },
  action: { fontSize: 14, fontWeight: "600" },
});
