import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back button when given. */
  onBack?: () => void;
  backLabel?: string;
  /** Node between back button and title (e.g. an Avatar). */
  leading?: ReactNode;
  /** Right-side actions (IconButtons). */
  actions?: ReactNode;
  /** Pad the status bar inset. Default true; set false when a Screen already pads the top. */
  safeTop?: boolean;
  /** Bottom hairline border (web header border). Default true. */
  border?: boolean;
}

/** Top bar: 60px (web --header-height), panel background, back + title + actions. */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  leading,
  actions,
  safeTop = true,
  border = true,
}: AppHeaderProps) {
  const { colors, spacing, controlHeights } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.panel,
        paddingTop: safeTop ? insets.top : 0,
        borderBottomWidth: border ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: controlHeights.header,
          paddingHorizontal: spacing.s8,
          gap: spacing.s8,
        }}
      >
        {onBack ? <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} flipRtl /> : null}
        {leading}
        <View style={{ flex: 1, minWidth: 0, paddingStart: onBack || leading ? 0 : spacing.s8 }}>
          <Text variant="heading" numberOfLines={1} style={{ fontSize: 19 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s4 }}>{actions}</View> : null}
      </View>
    </View>
  );
}
