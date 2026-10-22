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
  /** Bottom hairline border. Defaults to the web: sub-pages have one, top-level pages don't. */
  border?: boolean;
  /** Force the large top-level title even with a leading node (web chats header with the viewer avatar). */
  large?: boolean;
}

/**
 * Web `.pane-header` at phone width: min 60px, padding 16/16/8, gap 8.
 * Top-level pages (no back button, no leading node) get the sidebar title: 22px/600,
 * no border. Sub-pages get the main-pane title: 16px/500, panel background + border.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  leading,
  actions,
  safeTop = true,
  border,
  large,
}: AppHeaderProps) {
  const { colors, spacing, controlHeights, fontSizes, fontWeights } = useTheme();
  const topLevel = large ?? (!onBack && !leading);
  const showBorder = border ?? !topLevel;
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.panel,
        paddingTop: safeTop ? insets.top : 0,
        borderBottomWidth: showBorder ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: controlHeights.header,
          // `.convHeader` (with an avatar) is 8/16 with a 12 gap; `.pane-header` is 16/16/8 with 8.
          paddingTop: leading ? spacing.s8 : spacing.s16,
          paddingBottom: spacing.s8,
          paddingHorizontal: spacing.s16,
          gap: leading ? spacing.s12 : spacing.s8,
        }}
      >
        {onBack ? (
          <View style={{ marginStart: -spacing.s8 }}>
            <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} flipRtl />
          </View>
        ) : null}
        {leading}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="heading"
            numberOfLines={1}
            style={
              topLevel
                ? { fontSize: fontSizes.xxl, fontWeight: fontWeights.bold, letterSpacing: -0.22 }
                : { fontSize: fontSizes.lg, fontWeight: fontWeights.medium }
            }
          >
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
