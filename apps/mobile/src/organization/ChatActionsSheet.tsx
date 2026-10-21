import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import type { ChatFolder, ConversationSummary } from "@/data";
import { useChatOrganization, useFolders } from "@/organization/queries";

type Props = { chat: ConversationSummary | null; onClose: () => void };

/** Long-press menu for a chat row: archive or unarchive, and folder membership. */
export function ChatActionsSheet({ chat, onClose }: Props) {
  const t = useTranslations();
  const folders = useFolders();
  const org = useChatOrganization();

  function run(action: () => Promise<unknown>) {
    void action()
      .catch(() => undefined)
      .finally(onClose);
  }

  return (
    <Modal visible={chat !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("mobile.organization.cancel")}>
        <View style={styles.sheet}>
          {chat ? (
            <>
              <Pressable
                style={styles.item}
                accessibilityRole="button"
                onPress={() =>
                  run(() => (chat.archived_at ? org.unarchive.mutateAsync(chat.id) : org.archive.mutateAsync(chat.id)))
                }
              >
                <Text style={styles.itemText}>
                  {chat.archived_at ? t("mobile.organization.unarchive") : t("mobile.organization.archive")}
                </Text>
              </Pressable>
              {(folders.data ?? []).map((f: ChatFolder) => (
                <Pressable
                  key={f.id}
                  style={styles.item}
                  accessibilityRole="button"
                  onPress={() => run(() => org.move.mutateAsync({ conversationId: chat.id, folderId: f.id }))}
                >
                  <Text style={styles.itemText}>{t("mobile.organization.moveTo", { name: f.name })}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.item}
                accessibilityRole="button"
                onPress={() => run(() => org.removeFromFolder.mutateAsync(chat.id))}
              >
                <Text style={styles.itemText}>{t("mobile.organization.removeFromFolder")}</Text>
              </Pressable>
              <Pressable style={styles.item} accessibilityRole="button" onPress={onClose}>
                <Text style={styles.cancel}>{t("mobile.organization.cancel")}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8 },
  item: { paddingVertical: 14, paddingHorizontal: 20 },
  itemText: { fontSize: 16 },
  cancel: { fontSize: 16, color: "#666" },
});
