import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useBlocks, useSafetyActions } from "@/safety/queries";

export default function BlockedScreen() {
  const t = useTranslations();
  const router = useRouter();
  const blocks = useBlocks();
  const actions = useSafetyActions();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.safety.blocked")}</Text>
      </View>
      {blocks.isPending ? <ActivityIndicator /> : null}
      {blocks.isError || actions.unblock.isError ? <Text style={styles.error}>{t("mobile.safety.error")}</Text> : null}
      {blocks.isSuccess && blocks.data.length === 0 ? <Text style={styles.empty}>{t("mobile.safety.noBlocked")}</Text> : null}
      <FlatList
        data={blocks.data ?? []}
        keyExtractor={(b) => b.blockedId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.displayName ?? item.username}</Text>
              <Text style={styles.sub}>@{item.username}</Text>
            </View>
            <Pressable onPress={() => actions.unblock.mutate(item.blockedId)} accessibilityRole="button">
              <Text style={styles.link}>{t("mobile.safety.unblock")}</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  link: { color: "#4f46e5", fontSize: 16 },
  error: { color: "#b00020", paddingHorizontal: 16 },
  empty: { padding: 16, color: "#666" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 14 },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#666" },
});
