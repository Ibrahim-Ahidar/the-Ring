import { View } from "react-native";

import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface UnreadCountProps {
  count: number;
  /** Muted (grey) for muted conversations. */
  muted?: boolean;
}

/** Round count pill (web .badge / .badgeMuted). Renders nothing for 0. */
export function UnreadCount({ count, muted }: UnreadCountProps) {
  const { colors, radii } = useTheme();
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <View
      accessibilityLabel={`${text} unread`}
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: radii.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: muted ? colors.textDisabled : colors.accent,
      }}
    >
      <Text style={{ color: muted ? colors.panel : colors.accentContrast, fontSize: 12, lineHeight: 14, fontWeight: "600" }}>
        {text}
      </Text>
    </View>
  );
}

export interface BadgeProps {
  label: string;
  /** neutral = grey tag, accent = soft accent tag (web .tag / .tagNeutral), danger = red. */
  tone?: "accent" | "neutral" | "danger";
}

/** Small text tag. */
export function Badge({ label, tone = "accent" }: BadgeProps) {
  const { colors, radii, spacing } = useTheme();
  const bg = tone === "accent" ? colors.accentSoft : tone === "danger" ? colors.dangerSoft : colors.input;
  const fg = tone === "accent" ? colors.accentStrong : tone === "danger" ? colors.danger : colors.textMuted;
  return (
    <View
      style={{
        height: 22,
        paddingHorizontal: spacing.s8,
        borderRadius: radii.pill,
        backgroundColor: bg,
        justifyContent: "center",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontSize: 12, lineHeight: 16, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

/** 10px unread dot (web .dot). */
export function Dot() {
  const { colors } = useTheme();
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />;
}
