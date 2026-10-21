import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useContactActions, useContacts, useUserSearch } from "@/contacts/queries";

export default function ContactsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const contacts = useContacts();
  const search = useUserSearch(query);
  const actions = useContactActions();

  async function startChat(username: string) {
    try {
      const { conversationId } = await actions.startChat.mutateAsync(username);
      router.replace({ pathname: "/chats/[id]", params: { id: conversationId } });
    } catch {
      // surfaced through actions.startChat.isError
    }
  }

  const hit = search.data;
  const isContact = hit ? (contacts.data ?? []).some((c) => c.favoriteUserId === hit.id) : false;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.contacts.title")}</Text>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t("mobile.contacts.placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => setQuery(input.trim())}
        />
        <Pressable onPress={() => setQuery(input.trim())} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.contacts.search")}</Text>
        </Pressable>
      </View>
      {search.isFetching ? <ActivityIndicator /> : null}
      {search.isError || actions.startChat.isError || actions.add.isError ? (
        <Text style={styles.error}>{t("mobile.contacts.error")}</Text>
      ) : null}
      {query && search.isSuccess && !hit ? <Text style={styles.empty}>{t("mobile.contacts.noResult")}</Text> : null}
      {hit ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.name}>{hit.displayName ?? hit.username}</Text>
            <Text style={styles.sub}>@{hit.username}</Text>
            {hit.bio ? <Text style={styles.sub}>{hit.bio}</Text> : null}
          </View>
          <Pressable onPress={() => void startChat(hit.username)} accessibilityRole="button">
            <Text style={styles.link}>{t("mobile.contacts.message")}</Text>
          </Pressable>
          {!isContact ? (
            <Pressable onPress={() => actions.add.mutate(hit.username)} accessibilityRole="button">
              <Text style={styles.link}>{t("mobile.contacts.add")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.section}>{t("mobile.contacts.saved")}</Text>
      {contacts.isPending ? <ActivityIndicator /> : null}
      {contacts.isSuccess && contacts.data.length === 0 ? <Text style={styles.empty}>{t("mobile.contacts.empty")}</Text> : null}
      <FlatList
        data={contacts.data ?? []}
        keyExtractor={(c) => c.favoriteUserId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.displayName ?? item.username}</Text>
              <Text style={styles.sub}>@{item.username}</Text>
            </View>
            <Pressable onPress={() => void startChat(item.username)} accessibilityRole="button">
              <Text style={styles.link}>{t("mobile.contacts.message")}</Text>
            </Pressable>
            <Pressable onPress={() => actions.remove.mutate(item.username)} accessibilityRole="button">
              <Text style={styles.link}>{t("mobile.contacts.remove")}</Text>
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
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 },
  section: { fontWeight: "600", paddingHorizontal: 16, paddingTop: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 14 },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#666" },
});
