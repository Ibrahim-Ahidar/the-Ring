import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading element: an <Avatar/> or any node. Takes precedence over `icon`. */
  leading?: ReactNode;
  /** Leading lucide icon (settings rows). */
  icon?: LucideIcon;
  /** Trailing meta text (e.g. time) shown above a badge. */
  meta?: string;
  /** Trailing node, e.g. <UnreadCount/> or a switch. */
  trailing?: ReactNode;
  chevron?: boolean;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Omit for a non-interactive row. */
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Single-line subtitle (default 1). */
  subtitleLines?: number;
}

/** Row used for chat lists, contacts, settings. Min height 56 (web .listRow), radius card. */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  meta,
  trailing,
  chevron,
  selected,
  destructive,
  disabled,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  subtitleLines = 1,
}: ListRowProps) {
  const { colors, spacing, radii, controlHeights } = useTheme();
  const interactive = !!onPress || !!onLongPress;
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.s16,
        minHeight: controlHeights.listRow,
        padding: spacing.s12,
        borderRadius: radii.card,
        backgroundColor: pressed ? colors.hover : selected ? colors.selected : "transparent",
      }}
    >
      {leading ?? (icon ? <Icon icon={icon} size={24} tone={destructive ? "danger" : "icon"} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" tone={destructive ? "danger" : "text"} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta || trailing ? (
        <View style={{ alignItems: "flex-end", gap: spacing.s4 }}>
          {meta ? <Text variant="caption">{meta}</Text> : null}
          {trailing}
        </View>
      ) : null}
      {chevron ? <Icon icon={ChevronRight} size={20} tone="textMuted" flipRtl /> : null}
    </View>
  );

  if (!interactive) {
    return <View accessibilityLabel={accessibilityLabel}>{content(false)}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}
