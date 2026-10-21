import { useRouter } from "expo-router";
import { ArrowDown, ArrowUp, FolderOpen, Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useTranslations } from "use-intl";

import { organizationErrorKey } from "@/organization/errors";
import { useFolderActions, useFolders } from "@/organization/queries";
import {
  AppHeader,
  Banner,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingState,
  Screen,
  TextField,
  useTheme,
} from "@/ui";

export default function FoldersScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
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

  const createDisabled = actions.create.isPending || !newName.trim();

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.organization.folders")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.s8, padding: spacing.s12 }}>
        <View style={{ flex: 1 }}>
          <TextField
            value={newName}
            onChangeText={setNewName}
            placeholder={t("mobile.organization.folderName")}
            accessibilityLabel={t("mobile.organization.folderName")}
          />
        </View>
        <Button
          title={t("mobile.organization.create")}
          disabled={createDisabled}
          loading={actions.create.isPending}
          onPress={() => actions.create.mutate(newName.trim(), { onSuccess: () => setNewName("") })}
        />
      </View>
      {failure ? <Banner kind="error" message={t(organizationErrorKey(failure.message, t.has))} /> : null}
      {folders.isPending ? <LoadingState /> : null}
      {folders.isError ? <ErrorState title={t("mobile.organization.error")} onRetry={() => void folders.refetch()} /> : null}
      {folders.isPending || folders.isError ? null : (
        <FlatList
          data={list}
          keyExtractor={(f) => f.id}
          contentContainerStyle={list.length === 0 ? { flex: 1 } : { paddingHorizontal: spacing.s12 }}
          ItemSeparatorComponent={() => <Divider inset={spacing.s12} />}
          ListEmptyComponent={<EmptyState icon={FolderOpen} title={t("mobile.organization.noFolders")} />}
          renderItem={({ item, index }) =>
            editingId === item.id ? (
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.s8, paddingVertical: spacing.s8 }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    value={editName}
                    onChangeText={setEditName}
                    accessibilityLabel={t("mobile.organization.folderName")}
                    autoFocus
                  />
                </View>
                <Button
                  title={t("mobile.organization.save")}
                  disabled={!editName.trim()}
                  loading={actions.rename.isPending}
                  onPress={() =>
                    actions.rename.mutate(
                      { folderId: item.id, name: editName.trim() },
                      { onSuccess: () => setEditingId(null) },
                    )
                  }
                />
              </View>
            ) : (
              <ListRow
                icon={FolderOpen}
                title={item.name}
                trailing={
                  <View style={{ flexDirection: "row" }}>
                    <IconButton
                      icon={Pencil}
                      label={t("mobile.organization.rename")}
                      onPress={() => {
                        setEditingId(item.id);
                        setEditName(item.name);
                      }}
                    />
                    <IconButton
                      icon={ArrowUp}
                      label={t("mobile.organization.moveUp")}
                      disabled={index === 0}
                      onPress={() => move(index, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label={t("mobile.organization.moveDown")}
                      disabled={index === list.length - 1}
                      onPress={() => move(index, 1)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t("mobile.organization.delete")}
                      onPress={() => confirmDelete(item.id, item.name)}
                    />
                  </View>
                }
              />
            )
          }
        />
      )}
    </Screen>
  );
}
