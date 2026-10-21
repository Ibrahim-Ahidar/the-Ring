import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { REPORT_CATEGORIES } from "@/data";
import { useSafetyActions } from "@/safety/queries";

/** Block / report actions for the other user of a direct chat. */
export function SafetyMenu({ userId, onBlocked }: { userId: string; onBlocked?: () => void }) {
  const t = useTranslations();
  const actions = useSafetyActions();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setReporting(false);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setNotice(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t("mobile.safety.menu")}
      >
        <Text style={styles.link}>{t("mobile.safety.menu")}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <View style={styles.sheet}>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {reporting ? (
              REPORT_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  style={styles.item}
                  onPress={() =>
                    actions.report.mutate(
                      { userId, category },
                      {
                        onSuccess: () => {
                          close();
                          setNotice(t("mobile.safety.reported"));
                        },
                        onError: () => setNotice(t("mobile.safety.error")),
                      },
                    )
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.itemText}>{t(`mobile.safety.categories.${category}`)}</Text>
                </Pressable>
              ))
            ) : (
              <>
                <Pressable
                  style={styles.item}
                  onPress={() =>
                    actions.block.mutate(userId, {
                      onSuccess: () => {
                        close();
                        onBlocked?.();
                      },
                      onError: () => setNotice(t("mobile.safety.error")),
                    })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.danger}>{t("mobile.safety.block")}</Text>
                </Pressable>
                <Pressable style={styles.item} onPress={() => setReporting(true)} accessibilityRole="button">
                  <Text style={styles.itemText}>{t("mobile.safety.report")}</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.item} onPress={close} accessibilityRole="button">
              <Text style={styles.itemText}>{t("mobile.groups.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  link: { color: "#4f46e5", fontSize: 16 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#fff", padding: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  item: { paddingVertical: 14, paddingHorizontal: 8 },
  itemText: { fontSize: 16 },
  danger: { fontSize: 16, color: "#b00020" },
  notice: { color: "#b00020", padding: 8 },
});
