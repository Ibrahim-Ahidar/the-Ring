import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface BottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
}

/**
 * Web `.shell-nav` at phone width: panel bar with a top border, 4px vertical padding,
 * equal tabs of min 52px, 22px icons, accent when active. Labels (11px) only show
 * from 420px wide, like the web.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const { colors, spacing, fontSizes } = useTheme();
  const insets = useSafeAreaInsets();
  const showLabels = true;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: colors.panel,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: spacing.s4,
        paddingBottom: spacing.s4 + insets.bottom,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.active }}
          onPress={item.onPress}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: 52,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.s2,
            paddingVertical: spacing.s4,
            paddingHorizontal: spacing.s2,
            backgroundColor: pressed ? colors.hover : "transparent",
          })}
        >
          <Icon icon={item.icon} size={22} color={item.active ? colors.accent : colors.icon} />
          {showLabels ? (
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSizes.xs, color: item.active ? colors.accent : colors.icon }}
            >
              {item.label}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
