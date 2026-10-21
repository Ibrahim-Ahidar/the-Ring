import type { LucideIcon } from "lucide-react-native";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "./Icon";
import { useTheme } from "./ThemeProvider";

export interface IconButtonProps {
  icon: LucideIcon;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  onPress?: () => void;
  size?: "sm" | "md";
  /** Filled accent circle (web .iconBtnAccent), e.g. the send button. */
  accent?: boolean;
  /** Selected/toggled state (web aria-pressed). */
  selected?: boolean;
  disabled?: boolean;
  flipRtl?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Round icon button: 40px (32 sm) visual, always >=44pt touch area. */
export function IconButton({ icon, label, onPress, size = "md", accent, selected, disabled, flipRtl, style }: IconButtonProps) {
  const { colors, controlHeights, radii } = useTheme();
  const box = size === "sm" ? controlHeights.controlSm : controlHeights.control;
  const slop = Math.max(0, Math.ceil((controlHeights.hit - box) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={({ pressed }) => [
        {
          width: box,
          height: box,
          borderRadius: radii.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: disabled
            ? accent
              ? colors.input
              : "transparent"
            : accent
              ? pressed
                ? colors.accentStrong
                : colors.accent
              : pressed
                ? colors.pressed
                : selected
                  ? colors.selected
                  : "transparent",
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <View pointerEvents="none">
        <Icon
          icon={icon}
          size={size === "sm" ? 18 : 24}
          flipRtl={flipRtl}
          tone={disabled ? "textDisabled" : accent ? "accentContrast" : selected ? "text" : "icon"}
        />
      </View>
    </Pressable>
  );
}
