import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { useChatList } from "@/chats/queries";
import { signOut, type ConversationSummary } from "@/data";

function chatTitle(chat: ConversationSummary, fallback: string): string {
  return chat.type === "group"
    ? (chat.title ?? fallback)
    : (chat.other_display_name ?? chat.other_username ?? fallback);
}

export default function ChatListScreen() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [logoutFailed, setLogoutFailed] = useState(false);
  const list = useChatList(session?.userId ?? "");

  async function logout() {
    setLogoutFailed(false);
    const result = await signOut();
    // Drop cached server state so the next account never sees this one's data.
    queryClient.clear();
    if (!result.ok) setLogoutFailed(true);
  }

  const chats = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("mobile.chats.title")}</Text>
        <Pressable onPress={logout} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.logout.submit")}</Text>
        </Pressable>
      </View>
      {logoutFailed ? <Text style={styles.error}>{t("mobile.logout.error")}</Text> : null}
      {list.isPending ? <ActivityIndicator style={styles.center} /> : null}
      {list.isError ? (
        <Pressable onPress={() => list.refetch()} accessibilityRole="button">
          <Text style={styles.error}>{t("mobile.chats.loadError")}</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending || list.isError ? undefined : <Text style={styles.empty}>{t("mobile.chats.empty")}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/chats/[id]", params: { id: item.id } })}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {chatTitle(item, t("mobile.chats.untitled"))}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message_deletion_scope === "everyone"
                  ? t("mobile.chats.deleted")
                  : (item.last_message_preview ?? t("mobile.chats.noMessages"))}
              </Text>
            </View>
            {item.unread_count > 0 ? (
              <View style={styles.badge} accessibilityLabel={t("mobile.chats.unread", { count: item.unread_count })}>
                <Text style={styles.badgeText}>{item.unread_count}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 24, fontWeight: "600" },
  link: { color: "#4f46e5", fontSize: 16 },
  center: { marginTop: 24 },
  error: { color: "#b00020", paddingHorizontal: 16 },
  empty: { textAlign: "center", marginTop: 32, color: "#666" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  preview: { color: "#666" },
  badge: {
    minWidth: 24,
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
