import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { groupErrorKey } from "@/groups/errors";
import { useCreateGroup } from "@/groups/queries";

export default function NewGroupScreen() {
  const t = useTranslations();
  const router = useRouter();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function submit() {
    const result = await create.mutateAsync({ name, members }).catch(() => null);
    if (!result) return;
    if (result.failedInvites.length > 0) {
      setFailed(result.failedInvites.map((f) => f.username));
      setCreatedId(result.conversationId);
      return;
    }
    router.replace({ pathname: "/chats/[id]", params: { id: result.conversationId } });
  }

  const code = create.error?.message ?? "";
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.groups.newTitle")}</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("mobile.groups.name")}
          accessibilityLabel={t("mobile.groups.name")}
        />
        <TextInput
          style={styles.input}
          value={members}
          onChangeText={setMembers}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("mobile.groups.membersHint")}
          accessibilityLabel={t("mobile.groups.membersHint")}
        />
        {create.isError ? (
          <Text style={styles.error}>
            {t(groupErrorKey(code, t.has))}
          </Text>
        ) : null}
        {failed.length > 0 && createdId ? (
          <View>
            <Text style={styles.error}>{t("mobile.groups.invitesFailed", { names: failed.join(", ") })}</Text>
            <Pressable
              onPress={() => router.replace({ pathname: "/chats/[id]", params: { id: createdId } })}
              accessibilityRole="button"
            >
              <Text style={styles.link}>{t("mobile.groups.openGroup")}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.button, (create.isPending || !name.trim()) && styles.disabled]}
            disabled={create.isPending || !name.trim()}
            onPress={() => void submit()}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{t("mobile.groups.create")}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  link: { color: "#4f46e5", fontSize: 16 },
  form: { padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: "#b00020" },
  button: { backgroundColor: "#4f46e5", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
