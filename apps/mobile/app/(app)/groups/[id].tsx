import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { groupErrorKey } from "@/groups/errors";
import { useGroup, useGroupActions, useGroupMembers } from "@/groups/queries";

export default function GroupInfoScreen() {
  const t = useTranslations();
  const router = useRouter();
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

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.groups.info")}</Text>
      </View>
      {group.isPending || members.isPending ? <ActivityIndicator /> : null}
      {group.isError ? <Text style={styles.error}>{t("mobile.groups.error")}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {group.data ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            editable={isAdmin}
            accessibilityLabel={t("mobile.groups.name")}
          />
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            editable={isAdmin}
            placeholder={t("mobile.groups.description")}
            accessibilityLabel={t("mobile.groups.description")}
          />
          {isAdmin ? (
            <Pressable
              style={[styles.button, (actions.update.isPending || !name.trim()) && styles.disabled]}
              disabled={actions.update.isPending || !name.trim()}
              onPress={() => actions.update.mutate({ name, description: description.trim() || null })}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{t("mobile.groups.save")}</Text>
            </Pressable>
          ) : null}
          {isAdmin ? (
            <View style={styles.inviteRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("mobile.groups.addMember")}
                accessibilityLabel={t("mobile.groups.addMember")}
              />
              <Pressable
                style={[styles.button, (actions.invite.isPending || !username.trim()) && styles.disabled]}
                disabled={actions.invite.isPending || !username.trim()}
                onPress={() =>
                  actions.invite.mutate(username.trim().replace(/^@+/, ""), { onSuccess: () => setUsername("") })
                }
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>{t("mobile.groups.add")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={members.data ?? []}
        keyExtractor={(m) => m.userId}
        renderItem={({ item }) => (
          <View style={styles.member}>
            <View style={styles.flex}>
              <Text style={styles.memberName}>{item.displayName ?? item.username}</Text>
              <Text style={styles.sub}>
                @{item.username} · {t(`mobile.groups.roles.${item.role}`)}
              </Text>
            </View>
            {isAdmin && item.role !== "owner" && item.userId !== session?.userId ? (
              <Pressable onPress={() => actions.remove.mutate(item.userId)} accessibilityRole="button">
                <Text style={styles.danger}>{t("mobile.groups.remove")}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
      {group.data ? (
        <Pressable style={styles.leave} onPress={confirmLeave} accessibilityRole="button">
          <Text style={styles.danger}>{t("mobile.groups.leave")}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  link: { color: "#4f46e5", fontSize: 16 },
  form: { paddingHorizontal: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  inviteRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  error: { color: "#b00020", paddingHorizontal: 16 },
  button: { backgroundColor: "#4f46e5", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  member: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  memberName: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#666" },
  danger: { color: "#b00020", fontSize: 16 },
  leave: { padding: 16, alignItems: "center" },
});
