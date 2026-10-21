import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Stretch to the full width (web .btnBlock). */
  block?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Pill button. Mirrors web .btn / .btnPrimary / .btnSecondary / .btnGhost / .btnDanger. */
export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  block,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors, spacing, radii, controlHeights } = useTheme();
  const off = disabled || loading;
  const fg = variant === "primary" ? colors.accentContrast : variant === "danger" ? colors.danger : colors.accent;
  const tone = variant === "primary" ? "accentContrast" : variant === "danger" ? "danger" : "accent";
  const pressedBg = variant === "primary" ? colors.accentStrong : variant === "danger" ? colors.dangerSoft : colors.hover;
  const sm = size === "sm";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      // sm is 32 visually; hitSlop lifts the touch area to 44.
      hitSlop={sm ? { top: 6, bottom: 6 } : undefined}
      style={({ pressed }) => [
        {
          // md: 44pt (web is 40 with a mouse; touch needs 44).
          minHeight: sm ? controlHeights.controlSm : controlHeights.hit,
          paddingHorizontal: sm ? spacing.s16 : spacing.s24,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: variant === "secondary" || variant === "danger" ? colors.borderStrong : "transparent",
          backgroundColor: pressed ? pressedBg : variant === "primary" ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.s8,
          opacity: off ? 0.6 : 1,
          alignSelf: block ? "stretch" : "flex-start",
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon icon={icon} size={sm ? 16 : 20} tone={tone} />
      ) : null}
      <Text variant={sm ? "caption" : "label"} style={{ color: fg, fontWeight: "500" }}>
        {title}
      </Text>
    </Pressable>
  );
}
