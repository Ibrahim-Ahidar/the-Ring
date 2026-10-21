import { ActivityIndicator, View } from "react-native";

import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export function Spinner({ size = "small", color }: { size?: "small" | "large"; color?: string }) {
  const { colors } = useTheme();
  return <ActivityIndicator size={size} color={color ?? colors.accent} accessibilityRole="progressbar" />;
}

/** Centered full-area loading placeholder. */
export function LoadingState({ label }: { label?: string }) {
  const { spacing } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Loading"}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.s12, padding: spacing.s24 }}
    >
      <Spinner size="large" />
      {label ? <Text variant="caption">{label}</Text> : null}
    </View>
  );
}
