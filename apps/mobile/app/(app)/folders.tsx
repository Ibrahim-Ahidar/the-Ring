import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { organizationErrorKey } from "@/organization/errors";
import { useFolderActions, useFolders } from "@/organization/queries";

export default function FoldersScreen() {
  const t = useTranslations();
  const router = useRouter();
  const folders = useFolders();
  const actions = useFolderActions();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const list = folders.data ?? [];

  const failure = actions.create.error ?? actions.rename.error ?? actions.remove.error ?? actions.reorder.error;

  function move(index: number, delta: -1 | 1) {
    const ids = list.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    actions.reorder.mutate(ids);
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(t("mobile.organization.deleteTitle", { name }), t("mobile.organization.deleteBody"), [
      { text: t("mobile.organization.cancel"), style: "cancel" },
      { text: t("mobile.organization.delete"), style: "destructive", onPress: () => actions.remove.mutate(id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.organization.folders")}</Text>
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={newName}
          onChangeText={setNewName}
          placeholder={t("mobile.organization.folderName")}
          accessibilityLabel={t("mobile.organization.folderName")}
        />
        <Pressable
          style={[styles.button, (actions.create.isPending || !newName.trim()) && styles.disabled]}
          disabled={actions.create.isPending || !newName.trim()}
          onPress={() => actions.create.mutate(newName.trim(), { onSuccess: () => setNewName("") })}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{t("mobile.organization.create")}</Text>
        </Pressable>
      </View>
      {failure ? <Text style={styles.error}>{t(organizationErrorKey(failure.message, t.has))}</Text> : null}
      {folders.isPending ? <ActivityIndicator /> : null}
      {folders.isError ? <Text style={styles.error}>{t("mobile.organization.error")}</Text> : null}
      <FlatList
        data={list}
        keyExtractor={(f) => f.id}
        ListEmptyComponent={
          folders.isPending ? undefined : <Text style={styles.empty}>{t("mobile.organization.noFolders")}</Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.folder}>
            {editingId === item.id ? (
              <>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={editName}
                  onChangeText={setEditName}
                  accessibilityLabel={t("mobile.organization.folderName")}
                />
                <Pressable
                  disabled={!editName.trim() || actions.rename.isPending}
                  onPress={() =>
                    actions.rename.mutate(
                      { folderId: item.id, name: editName.trim() },
                      { onSuccess: () => setEditingId(null) },
                    )
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>{t("mobile.organization.save")}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.flex, styles.folderName]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pressable
                  onPress={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>{t("mobile.organization.rename")}</Text>
                </Pressable>
                <Pressable
                  disabled={index === 0}
                  onPress={() => move(index, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={t("mobile.organization.moveUp")}
                >
                  <Text style={[styles.link, index === 0 && styles.disabled]}>{"↑"}</Text>
                </Pressable>
                <Pressable
                  disabled={index === list.length - 1}
                  onPress={() => move(index, 1)}
                  accessibilityRole="button"
                  accessibilityLabel={t("mobile.organization.moveDown")}
                >
                  <Text style={[styles.link, index === list.length - 1 && styles.disabled]}>{"↓"}</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item.id, item.name)} accessibilityRole="button">
                  <Text style={styles.danger}>{t("mobile.organization.delete")}</Text>
                </Pressable>
              </>
            )}
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
  row: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 16 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 16 },
  button: { backgroundColor: "#4f46e5", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  error: { color: "#b00020", paddingHorizontal: 16, paddingTop: 8 },
  empty: { textAlign: "center", marginTop: 32, color: "#666" },
  folder: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  folderName: { fontSize: 16, fontWeight: "600" },
  danger: { color: "#b00020", fontSize: 16 },
});
