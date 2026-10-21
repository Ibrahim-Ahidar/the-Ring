import { Image, View } from "react-native";

import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";
import { avatarColourIndex, avatarInitials } from "./avatar-helpers";
import { avatarColor } from "./theme";

export { avatarColourIndex, avatarInitials };

export type AvatarSize = "xs" | "sm" | "md" | "default" | "lg" | "xl";

const SIZE: Record<AvatarSize, { box: number; font: number }> = {
  xs: { box: 24, font: 10 },
  sm: { box: 32, font: 12 },
  md: { box: 40, font: 14 },
  default: { box: 48, font: 17 },
  lg: { box: 80, font: 28 },
  xl: { box: 120, font: 40 },
};

export interface AvatarProps {
  name: string | null | undefined;
  /** Stable id (user or conversation) that picks the fallback color. */
  seed: string;
  /** Absolute http(s) image URL. Falls back to initials when missing or failing. */
  src?: string | null;
  size?: AvatarSize;
  /** Green presence dot at the bottom end. */
  online?: boolean;
}

export function Avatar({ name, seed, src, size = "default", online }: AvatarProps) {
  const { colors } = useTheme();
  const { box, font } = SIZE[size];
  const uri = src && /^https?:\/\//.test(src) ? src : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: avatarColor(colors, avatarColourIndex(seed)),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: box, height: box, borderRadius: box / 2 }} />
      ) : (
        <Text style={{ color: colors.avatarText, fontSize: font, lineHeight: font, fontWeight: "600", letterSpacing: 0.3 }}>
          {avatarInitials(name)}
        </Text>
      )}
      {online ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            end: 0,
            width: Math.max(8, box / 4),
            height: Math.max(8, box / 4),
            borderRadius: 99,
            backgroundColor: colors.online,
            borderWidth: 2,
            borderColor: colors.panel,
          }}
        />
      ) : null}
    </View>
  );
}
