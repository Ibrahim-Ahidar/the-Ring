import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useMessageRequests, useRequestActions } from "@/safety/queries";

export default function RequestsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const requests = useMessageRequests();
  const actions = useRequestActions();
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const failed = actions.accept.isError || actions.decline.isError;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.safety.requests")}</Text>
      </View>
      {requests.isPending ? <ActivityIndicator /> : null}
      {requests.isError ? <Text style={styles.error}>{t("mobile.safety.error")}</Text> : null}
      {failed ? <Text style={styles.error}>{t("mobile.safety.error")}</Text> : null}
      {requests.isSuccess && pending.length === 0 ? <Text style={styles.empty}>{t("mobile.safety.noRequests")}</Text> : null}
      <FlatList
        data={pending}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.displayName ?? item.username}</Text>
              <Text style={styles.sub}>@{item.username}</Text>
              {item.note ? <Text style={styles.sub}>{item.note}</Text> : null}
            </View>
            <Pressable
              onPress={() =>
                actions.accept.mutate(item.id, {
                  onSuccess: (r) => router.replace({ pathname: "/chats/[id]", params: { id: r.conversationId } }),
                })
              }
              accessibilityRole="button"
            >
              <Text style={styles.link}>{t("mobile.safety.accept")}</Text>
            </Pressable>
            <Pressable onPress={() => actions.decline.mutate(item.id)} accessibilityRole="button">
              <Text style={styles.danger}>{t("mobile.safety.decline")}</Text>
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
  danger: { color: "#b00020", fontSize: 16 },
  error: { color: "#b00020", paddingHorizontal: 16 },
  empty: { padding: 16, color: "#666" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 14 },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#666" },
});
