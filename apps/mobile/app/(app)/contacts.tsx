import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import { useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useTranslations } from "use-intl";

import { useContactActions, useContacts, useUserSearch } from "@/contacts/queries";
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  SearchField,
  SectionHeader,
  Spinner,
  useTheme,
} from "@/ui";

export default function ContactsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
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

  function confirmRemove(username: string) {
    Alert.alert(t("mobile.contacts.remove"), `@${username}`, [
      { text: t("mobile.groups.cancel"), style: "cancel" },
      { text: t("mobile.contacts.remove"), style: "destructive", onPress: () => actions.remove.mutate(username) },
    ]);
  }

  const hit = search.data;
  const isContact = hit ? (contacts.data ?? []).some((c) => c.favoriteUserId === hit.id) : false;
  const actionError = search.isError || actions.startChat.isError || actions.add.isError;

  const header = (
    <View>
      <View style={{ padding: spacing.s12, gap: spacing.s8 }}>
        <SearchField
          value={input}
          onChangeText={setInput}
          placeholder={t("mobile.contacts.placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => setQuery(input.trim())}
        />
        <Button title={t("mobile.contacts.search")} variant="secondary" size="sm" onPress={() => setQuery(input.trim())} />
      </View>
      {search.isFetching ? <Spinner /> : null}
      {actionError ? <Banner kind="error" message={t("mobile.contacts.error")} /> : null}
      {query && search.isSuccess && !hit ? <Banner kind="info" message={t("mobile.contacts.noResult")} /> : null}
      {hit ? (
        <>
          <ListRow
            title={hit.displayName ?? hit.username}
            subtitle={hit.bio ? `@${hit.username} · ${hit.bio}` : `@${hit.username}`}
            subtitleLines={2}
            leading={<Avatar name={hit.displayName ?? hit.username} seed={hit.id} />}
            onPress={() => void startChat(hit.username)}
            trailing={
              !isContact ? (
                <Button
                  title={t("mobile.contacts.add")}
                  size="sm"
                  variant="secondary"
                  onPress={() => actions.add.mutate(hit.username)}
                />
              ) : undefined
            }
          />
          <Divider />
        </>
      ) : null}
      <SectionHeader title={t("mobile.contacts.saved")} />
    </View>
  );

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.contacts.title")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {contacts.isError ? (
        <ErrorState message={t("mobile.contacts.error")} onRetry={() => void contacts.refetch()} />
      ) : (
        <FlatList
          data={contacts.data ?? []}
          keyExtractor={(c) => c.favoriteUserId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            contacts.isPending ? <LoadingState /> : <EmptyState icon={Users} title={t("mobile.contacts.empty")} />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.displayName ?? item.username}
              subtitle={`@${item.username}`}
              leading={<Avatar name={item.displayName ?? item.username} seed={item.favoriteUserId} />}
              onPress={() => void startChat(item.username)}
              onLongPress={() => confirmRemove(item.username)}
              accessibilityHint={t("mobile.contacts.message")}
              trailing={
                <Button
                  title={t("mobile.contacts.remove")}
                  variant="ghost"
                  size="sm"
                  onPress={() => confirmRemove(item.username)}
                />
              }
            />
          )}
        />
      )}
    </Screen>
  );
}
