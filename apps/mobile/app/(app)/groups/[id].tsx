import { useLocalSearchParams, useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { groupErrorKey } from "@/groups/errors";
import { useGroup, useGroupActions, useGroupMembers } from "@/groups/queries";
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  Button,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  TextField,
  useTheme,
} from "@/ui";

export default function GroupInfoScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const group = useGroup(id);
  const members = useGroupMembers(id);
  const actions = useGroupActions(id);
  const [nameEdit, setName] = useState<string | null>(null);
  const [descriptionEdit, setDescription] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const name = nameEdit ?? group.data?.title ?? "";
  const description = descriptionEdit ?? group.data?.description ?? "";

  const role = group.data?.myRole;
  const isAdmin = role === "owner" || role === "admin";

  function errorText(e: Error | null): string | null {
    if (!e) return null;
    return t(groupErrorKey(e.message, t.has));
  }
  const error = errorText(
    actions.update.error ?? actions.invite.error ?? actions.remove.error ?? actions.leave.error ?? null,
  );

  function confirmLeave() {
    Alert.alert(t("mobile.groups.leave"), t("mobile.groups.leaveConfirm"), [
      { text: t("mobile.groups.cancel"), style: "cancel" },
      {
        text: t("mobile.groups.leave"),
        style: "destructive",
        onPress: () => actions.leave.mutate(undefined, { onSuccess: () => router.replace("/") }),
      },
    ]);
  }

  function confirmRemove(userId: string, label: string) {
    Alert.alert(t("mobile.groups.remove"), label, [
      { text: t("mobile.groups.cancel"), style: "cancel" },
      { text: t("mobile.groups.remove"), style: "destructive", onPress: () => actions.remove.mutate(userId) },
    ]);
  }

  const header = group.data ? (
    <View>
      <View style={{ padding: spacing.s16, gap: spacing.s12 }}>
        <TextField
          label={t("mobile.groups.name")}
          value={name}
          onChangeText={setName}
          editable={isAdmin}
          accessibilityLabel={t("mobile.groups.name")}
        />
        <TextField
          label={t("mobile.groups.description")}
          value={description}
          onChangeText={setDescription}
          editable={isAdmin}
          placeholder={t("mobile.groups.description")}
          accessibilityLabel={t("mobile.groups.description")}
        />
        {isAdmin ? (
          <Button
            title={t("mobile.groups.save")}
            block
            loading={actions.update.isPending}
            disabled={actions.update.isPending || !name.trim()}
            onPress={() => actions.update.mutate({ name, description: description.trim() || null })}
          />
        ) : null}
        {isAdmin ? (
          <View style={{ flexDirection: "row", gap: spacing.s8, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("mobile.groups.addMember")}
                accessibilityLabel={t("mobile.groups.addMember")}
              />
            </View>
            <Button
              title={t("mobile.groups.add")}
              variant="secondary"
              loading={actions.invite.isPending}
              disabled={actions.invite.isPending || !username.trim()}
              onPress={() =>
                actions.invite.mutate(username.trim().replace(/^@+/, ""), { onSuccess: () => setUsername("") })
              }
            />
          </View>
        ) : null}
      </View>
      <SectionHeader title={t("mobile.groups.info")} muted />
    </View>
  ) : undefined;

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.groups.info")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {error ? <Banner kind="error" message={error} /> : null}
      {group.isError ? (
        <ErrorState message={t("mobile.groups.error")} onRetry={() => void group.refetch()} />
      ) : group.isPending || members.isPending ? (
        <LoadingState />
      ) : (
        <FlatList
          data={members.data ?? []}
          keyExtractor={(m) => m.userId}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListFooterComponent={
            group.data ? (
              <View style={{ padding: spacing.s16 }}>
                <Button title={t("mobile.groups.leave")} variant="danger" icon={LogOut} block onPress={confirmLeave} />
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            const label = item.displayName ?? item.username;
            const removable = isAdmin && item.role !== "owner" && item.userId !== session?.userId;
            return (
              <ListRow
                title={label}
                subtitle={`@${item.username}`}
                leading={<Avatar name={label} seed={item.userId} />}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8 }}>
                    <Badge label={t(`mobile.groups.roles.${item.role}`)} tone="neutral" />
                    {removable ? (
                      <Button
                        title={t("mobile.groups.remove")}
                        variant="ghost"
                        size="sm"
                        onPress={() => confirmRemove(item.userId, label)}
                      />
                    ) : null}
                  </View>
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
