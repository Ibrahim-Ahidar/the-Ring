import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Label for the scrim, read by screen readers as the dismiss action. */
  closeLabel?: string;
  children: ReactNode;
}

/** Bottom sheet over a scrim (web --color-modal, --shadow-modal, --color-overlay). */
export function Sheet({ visible, onClose, title, closeLabel = "Close", children }: SheetProps) {
  const { colors, spacing, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.overlay }}
        />
        <View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: colors.modal,
              borderTopStartRadius: 16,
              borderTopEndRadius: 16,
              paddingTop: spacing.s12,
              paddingHorizontal: spacing.s16,
              paddingBottom: insets.bottom + spacing.s16,
              maxHeight: "85%",
            },
            shadows.modal,
          ]}
        >
          <View
            style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.s12 }}
          />
          {title ? (
            <Text variant="heading" style={{ marginBottom: spacing.s12 }}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
