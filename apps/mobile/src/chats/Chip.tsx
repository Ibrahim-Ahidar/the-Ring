import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable } from "react-native";

import { Icon, Text, useTheme } from "@/ui";

/** Filter / shortcut pill: web `.chip` (32px outlined pill, accent-soft when active). */
export const Chip = memo(function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  /** Icon-only chip (web folder-edit chip); label becomes the accessible name. */
  icon?: LucideIcon;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radii, fontWeights } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: spacing.s8, bottom: spacing.s8 }}
      style={{
        height: 32,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.s4,
        paddingHorizontal: spacing.s12,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? "transparent" : colors.border,
        backgroundColor: active ? colors.accentSoft : "transparent",
      }}
    >
      {icon ? (
        <Icon icon={icon} size={16} tone="textMuted" />
      ) : (
        <Text
          variant="caption"
          style={{ fontSize: 13, color: active ? colors.accentStrong : colors.textMuted, fontWeight: fontWeights.medium }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
});
