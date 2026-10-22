import { useLocalSearchParams, useRouter } from "expo-router";
import { MessageCircle, Star, Users } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";

import { useContactActions, useMyProfile, useUserProfile } from "@/contacts/queries";
import { avatarUrl } from "@/data";
import { SafetyMenu } from "@/safety/SafetyMenu";
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  Text,
  useTheme,
} from "@/ui";

/** Mirrors the web /app/profile/[username] page: hero, actions, shared groups, block/report. */
export default function UserProfileScreen() {
  const t = useTranslations("mobile.contacts.view");
  const tc = useTranslations("mobile.contacts");
  const format = useFormatter();
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const { username = "" } = useLocalSearchParams<{ username: string }>();
  const profile = useUserProfile(username);
  const me = useMyProfile();
  const actions = useContactActions();

  async function startChat() {
    try {
      const { conversationId } = await actions.startChat.mutateAsync(username);
      router.replace({ pathname: "/chats/[id]", params: { id: conversationId } });
    } catch {
      // surfaced through actions.startChat.isError
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace("/contacts"));
  const header = <AppHeader title={t("title")} onBack={back} />;

  if (profile.isPending) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <ErrorState message={tc("errors.generic")} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  const name = p.displayName ?? p.username;
  const favorited = p.isFavorited ?? false;
  const isSelf = me.data?.id === p.id;
  const busy = actions.add.isPending || actions.remove.isPending;

  const presence =
    p.isOnline === undefined
      ? null
      : p.isOnline
        ? t("online")
        : p.lastSeenAt
          ? t("lastSeen", { time: format.dateTime(new Date(p.lastSeenAt), { dateStyle: "medium", timeStyle: "short" }) })
          : t("offline");

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginHorizontal: spacing.s16,
    marginTop: spacing.s16,
    overflow: "hidden" as const,
  };

  return (
    <Screen edges={["start", "end"]} background="panel">
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s24 }}>
        <View style={{ alignItems: "center", padding: spacing.s24, gap: spacing.s4 }}>
          <Avatar name={name} seed={p.id} src={avatarUrl(p.avatarUrl)} size="xl" />
          <Text variant="heading" style={{ marginTop: spacing.s8 }}>
            {name}
          </Text>
          <Text tone="textMuted">@{p.username}</Text>
          {presence ? (
            <Text variant="caption" style={{ color: p.isOnline ? colors.accent : colors.textMuted }}>
              {presence}
            </Text>
          ) : null}
          {p.bio ? <Text style={{ textAlign: "center", marginTop: spacing.s8 }}>{p.bio}</Text> : null}
          <View style={{ flexDirection: "row", gap: spacing.s8, marginTop: spacing.s16 }}>
            <Button
              title={t("startConversation")}
              icon={MessageCircle}
              loading={actions.startChat.isPending}
              onPress={() => void startChat()}
            />
            <Button
              title={favorited ? t("unfavoriteShort") : t("favoriteShort")}
              icon={Star}
              variant="secondary"
              disabled={busy}
              accessibilityLabel={favorited ? t("unfavorite", { username: p.username }) : t("favorite", { username: p.username })}
              onPress={() => (favorited ? actions.remove : actions.add).mutate(p.username)}
            />
          </View>
        </View>

        {actions.startChat.isError || actions.add.isError || actions.remove.isError ? (
          <Banner kind="error" message={tc("errors.generic")} />
        ) : null}

        {p.sharedGroups !== undefined ? (
          <View style={card}>
            <Text variant="bodyStrong" style={{ padding: spacing.s16, paddingBottom: spacing.s8 }}>
              {t("sharedGroups")}
            </Text>
            {p.sharedGroups.length === 0 ? (
              <Text tone="textMuted" variant="caption" style={{ paddingHorizontal: spacing.s16, paddingBottom: spacing.s16 }}>
                {t("noSharedGroups")}
              </Text>
            ) : (
              p.sharedGroups.map((group) => (
                <View
                  key={group.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.s12, padding: spacing.s12, paddingHorizontal: spacing.s16 }}
                >
                  <Icon icon={Users} size={20} tone="icon" />
                  <Text>{group.title ?? t("untitledGroup")}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {!isSelf ? (
          <View style={[card, { padding: spacing.s8, alignItems: "flex-start" }]}>
            <SafetyMenu userId={p.id} onBlocked={back} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
