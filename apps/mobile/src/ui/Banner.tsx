import { CircleAlert, Info, WifiOff, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type BannerKind = "offline" | "info" | "error";

export interface BannerProps {
  kind?: BannerKind;
  message: string;
  /** Trailing control, e.g. a small ghost Button. */
  action?: ReactNode;
}

const ICONS: Record<BannerKind, LucideIcon> = { offline: WifiOff, info: Info, error: CircleAlert };

/** Full-width status strip. offline = neutral input grey, info = soft accent, error = soft danger. */
export function Banner({ kind = "info", message, action }: BannerProps) {
  const { colors, spacing } = useTheme();
  const bg = kind === "error" ? colors.dangerSoft : kind === "info" ? colors.accentSoft : colors.input;
  const fg = kind === "error" ? colors.danger : kind === "info" ? colors.accentStrong : colors.text;
  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : "summary"}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.s12,
        minHeight: 40,
        paddingVertical: spacing.s8,
        paddingHorizontal: spacing.s16,
        backgroundColor: bg,
      }}
    >
      <Icon icon={ICONS[kind]} size={18} color={fg} />
      <Text variant="caption" style={{ flex: 1, color: fg }}>
        {message}
      </Text>
      {action}
    </View>
  );
}
