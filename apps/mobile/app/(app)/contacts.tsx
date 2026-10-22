import { useRouter } from "expo-router";
import { AtSign, Search, Star, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";

import { useContacts, useRecentActions, useRecentSearches, useUserSearch } from "@/contacts/queries";
import { avatarUrl } from "@/data";
import { AppHeader, Avatar, Icon, IconButton, ListRow, Screen, SectionHeader, Text, useTheme } from "@/ui";

/** Mirrors the web ContactsPageView: username search, contacts (favorites), recent searches. */
export default function ContactsScreen() {
  const t = useTranslations("mobile.contacts");
  const router = useRouter();
  const { colors, spacing, radii, fontSizes } = useTheme();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const contacts = useContacts();
  const search = useUserSearch(query);
  const recents = useRecentSearches();
  const recentActions = useRecentActions();

  const openProfile = (username: string) =>
    router.push({ pathname: "/profile/[username]", params: { username } });
  const submit = () => setQuery(input.trim().replace(/^@/, ""));

  const hit = search.data;
  const searchError = search.isError
    ? search.error.message.endsWith("rate_limited")
      ? t("errors.platform.rate_limited")
      : t("errors.generic")
    : null;
  const note = (message: string, danger = false) => (
    <Text variant="caption" style={{ color: danger ? colors.danger : colors.textMuted, paddingHorizontal: spacing.s16, paddingVertical: spacing.s8 }}>
      {message}
    </Text>
  );

  return (
    <Screen edges={["start", "end"]} background="panel">
      <AppHeader title={t("title")} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.s24 }}>
        <SectionHeader title={t("searchForm.title")} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.s8,
            marginHorizontal: spacing.s16,
            paddingStart: spacing.s12,
            paddingEnd: spacing.s4,
            minHeight: 44,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.input,
          }}
        >
          <Icon icon={AtSign} size={16} tone="textMuted" />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("searchForm.placeholder")}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t("searchForm.label")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
            style={{ flex: 1, color: colors.text, fontSize: fontSizes.sm, paddingVertical: spacing.s8 }}
          />
          <IconButton icon={Search} label={t("searchForm.submit")} size="sm" onPress={submit} />
        </View>
        {searchError ? note(searchError, true) : null}
        {search.isFetching ? note(t("searchForm.loading")) : null}
        {query && search.isSuccess && !hit ? note(t("searchForm.noResult")) : null}
        {hit ? (
          <ListRow
            title={hit.displayName ?? hit.username}
            subtitle={hit.bio ? `@${hit.username} · ${hit.bio}` : `@${hit.username}`}
            leading={<Avatar name={hit.displayName ?? hit.username} seed={hit.id} src={avatarUrl(hit.avatarUrl)} />}
            accessibilityLabel={t("searchForm.resultsLabel")}
            onPress={() => openProfile(hit.username)}
          />
        ) : null}

        <SectionHeader title={t("favorites.title")} />
        {contacts.isPending ? note(t("favorites.loading")) : null}
        {contacts.isError ? note(t("errors.generic"), true) : null}
        {contacts.isSuccess && contacts.data.length === 0 ? note(t("favorites.empty")) : null}
        {(contacts.data ?? []).map((c) => (
          <ListRow
            key={c.favoriteUserId}
            title={c.displayName ?? c.username}
            subtitle={`@${c.username}`}
            leading={<Avatar name={c.displayName ?? c.username} seed={c.favoriteUserId} src={avatarUrl(c.avatarUrl)} />}
            trailing={<Star size={16} color={colors.accent} fill={colors.accent} />}
            onPress={() => openProfile(c.username)}
          />
        ))}

        {recents.data && recents.data.length > 0 ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingEnd: spacing.s16 }}>
              <SectionHeader title={t("recents.title")} />
              <Pressable
                accessibilityRole="button"
                disabled={recentActions.clearAll.isPending}
                onPress={() => recentActions.clearAll.mutate()}
                hitSlop={8}
              >
                <Text variant="caption" style={{ color: colors.accent }}>
                  {t("recents.clearAll")}
                </Text>
              </Pressable>
            </View>
            {recents.data.map((r) => (
              <ListRow
                key={r.id}
                title={r.displayName ?? r.username}
                subtitle={`@${r.username}`}
                leading={<Avatar name={r.displayName ?? r.username} seed={r.username} src={avatarUrl(r.avatarUrl)} />}
                onPress={() => openProfile(r.username)}
                trailing={
                  <IconButton
                    icon={X}
                    size="sm"
                    label={t("recents.removeOne", { username: r.username })}
                    onPress={() => recentActions.clear.mutate(r.id)}
                  />
                }
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
