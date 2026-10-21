import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { ALLOWED_REACTION_EMOJI, type MessageAction } from "@/data";

type Props = {
  visible: boolean;
  actions: MessageAction[];
  mineEmoji: readonly string[];
  onReact: (emoji: string) => void;
  onAction: (action: Exclude<MessageAction, "react">) => void;
  onClose: () => void;
};

/** Long-press menu: reaction row plus the message actions the permission rules allow. */
export function MessageMenu({ visible, actions, mineEmoji, onReact, onAction, onClose }: Props) {
  const t = useTranslations();
  const rest = actions.filter((a): a is Exclude<MessageAction, "react"> => a !== "react");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("mobile.actions.cancel")}>
        <View style={styles.sheet} accessibilityViewIsModal>
          {actions.includes("react") ? (
            <View style={styles.emojiRow}>
              {ALLOWED_REACTION_EMOJI.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => onReact(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={t("mobile.actions.reactionLabel", { emoji })}
                  style={[styles.emoji, mineEmoji.includes(emoji) && styles.emojiMine]}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {rest.map((action) => (
            <Pressable
              key={action}
              onPress={() => onAction(action)}
              accessibilityRole="button"
              style={styles.item}
            >
              <Text style={[styles.itemText, action === "delete" && styles.danger]}>
                {t(`mobile.actions.${action}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12 },
  emojiRow: { flexDirection: "row", justifyContent: "space-around", paddingBottom: 8 },
  emoji: { padding: 8, borderRadius: 20 },
  emojiMine: { backgroundColor: "#e0e7ff" },
  emojiText: { fontSize: 26 },
  item: { paddingVertical: 14, paddingHorizontal: 8 },
  itemText: { fontSize: 16 },
  danger: { color: "#b00020" },
});
