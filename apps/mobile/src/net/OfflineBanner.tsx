import { StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { useOnline } from "./useOnline";

export function OfflineBanner() {
  const t = useTranslations();
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{t("mobile.offline.banner")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "#374151", paddingVertical: 6, paddingHorizontal: 16 },
  text: { color: "#fff", fontSize: 13, textAlign: "center" },
});
