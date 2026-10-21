import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export function Divider({ inset = 0 }: { /** Start inset in px (e.g. 72 to align with ListRow text). */ inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, marginStart: inset, backgroundColor: colors.border }} />;
}

export interface SurfaceProps {
  children: ReactNode;
  /** card (default) | elevated (menus, raised) | input (grey well) | flat (no border). */
  tone?: "card" | "elevated" | "input" | "flat";
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Rounded container (web --radius-card, --color-card, 1px --color-border). */
export function Surface({ children, tone = "card", padded = true, style }: SurfaceProps) {
  const { colors, radii, spacing, shadows } = useTheme();
  const bg = tone === "elevated" ? colors.elevated : tone === "input" ? colors.input : colors.card;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radii.card,
          borderWidth: tone === "flat" || tone === "input" ? 0 : 1,
          borderColor: colors.border,
          padding: padded ? spacing.s16 : 0,
          overflow: "hidden",
        },
        tone === "elevated" ? shadows.menu : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  /** Muted grey instead of accent (web .sectionLabelMuted). */
  muted?: boolean;
  action?: ReactNode;
}

/** Small section label above a list or settings group (web .sectionLabel). */
export function SectionHeader({ title, muted, action }: SectionHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: spacing.s16,
        paddingBottom: spacing.s8,
        paddingHorizontal: spacing.s12,
      }}
    >
      <Text variant="label" tone={muted ? "textMuted" : "accent"} accessibilityRole="header" style={{ fontSize: 13 }}>
        {title}
      </Text>
      {action}
    </View>
  );
}
