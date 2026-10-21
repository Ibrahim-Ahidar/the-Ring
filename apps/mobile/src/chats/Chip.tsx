import { memo } from "react";
import { Pressable } from "react-native";

import { Text, useTheme } from "@/ui";

/** Filter / shortcut pill (web chat list filter chips). */
export const Chip = memo(function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radii, controlHeights, fontWeights } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: spacing.s8, bottom: spacing.s8 }}
      style={{
        minHeight: controlHeights.controlSm,
        justifyContent: "center",
        paddingHorizontal: spacing.s12,
        borderRadius: radii.pill,
        backgroundColor: active ? colors.accent : colors.input,
      }}
    >
      <Text
        variant="caption"
        style={{ color: active ? colors.accentContrast : colors.text, fontWeight: active ? fontWeights.bold : fontWeights.regular }}
      >
        {label}
      </Text>
    </Pressable>
  );
});
