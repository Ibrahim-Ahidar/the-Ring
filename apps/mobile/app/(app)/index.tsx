import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { useChatList } from "@/chats/queries";
import { OfflineBanner } from "@/net/OfflineBanner";
import { ChatActionsSheet } from "@/organization/ChatActionsSheet";
import { useArchivedSummary, useFolders } from "@/organization/queries";
import { signOut, type ChatListFilter, type ConversationSummary } from "@/data";

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
  const [filter, setFilter] = useState<ChatListFilter>({ kind: "all" });
  const [actionsFor, setActionsFor] = useState<ConversationSummary | null>(null);
  const list = useChatList(session?.userId ?? "", filter);
  const folders = useFolders();
  const archived = useArchivedSummary();

  function isActive(f: ChatListFilter): boolean {
    return f.kind === filter.kind && (f.kind !== "folder" || (filter.kind === "folder" && filter.folderId === f.folderId));
  }
  const chips: { key: string; label: string; value: ChatListFilter }[] = [
    { key: "all", label: t("mobile.organization.filters.all"), value: { kind: "all" } },
    { key: "unread", label: t("mobile.organization.filters.unread"), value: { kind: "unread" } },
    { key: "groups", label: t("mobile.organization.filters.groups"), value: { kind: "groups" } },
    ...(folders.data ?? []).map((f) => ({
      key: f.id,
      label: f.name,
      value: { kind: "folder", folderId: f.id } as ChatListFilter,
    })),
    {
      key: "archived",
      label:
        archived.data && archived.data.count > 0
          ? t("mobile.organization.filters.archivedCount", { count: archived.data.count })
          : t("mobile.organization.filters.archived"),
      value: { kind: "archived" },
    },
  ];

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
        <Pressable onPress={() => router.push("/groups/new")} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.groups.newGroup")}</Text>
        </Pressable>
        <Pressable onPress={logout} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.logout.submit")}</Text>
        </Pressable>
      </View>
      <View style={styles.links}>
        <Pressable onPress={() => router.push("/requests")} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.safety.requests")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/blocked")} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.safety.blocked")}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
        {chips.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setFilter(c.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive(c.value) }}
            style={[styles.chip, isActive(c.value) && styles.chipActive]}
          >
            <Text style={isActive(c.value) ? styles.chipTextActive : styles.chipText}>{c.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push("/folders")} accessibilityRole="button" style={styles.chip}>
          <Text style={styles.link}>{t("mobile.organization.manageFolders")}</Text>
        </Pressable>
      </ScrollView>
      <OfflineBanner />
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
            onLongPress={() => setActionsFor(item)}
            accessibilityHint={t("mobile.organization.longPressHint")}
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
      <ChatActionsSheet chat={actionsFor} onClose={() => setActionsFor(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chipScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: "center" },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#ccc" },
  chipActive: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  chipText: { color: "#333" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  links: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 8 },
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
