import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "./ThemeProvider";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. For long lists use a FlatList yourself and keep scroll={false}. */
  scroll?: boolean;
  /** Safe-area edges to pad. Default: all (use ["bottom"] under an AppHeader that pads the top). */
  edges?: ("top" | "bottom" | "start" | "end")[];
  /** Pad content by spacing.s16. */
  padded?: boolean;
  background?: "bg" | "panel" | "chatBg";
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = false,
  edges = ["top", "bottom", "start", "end"],
  padded = false,
  background = "bg",
  contentStyle,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const outer: ViewStyle = {
    flex: 1,
    backgroundColor: colors[background],
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    paddingStart: edges.includes("start") ? insets.left : 0,
    paddingEnd: edges.includes("end") ? insets.right : 0,
  };
  const inner: ViewStyle = padded ? { padding: spacing.s16 } : {};
  if (scroll) {
    return (
      <View style={outer}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[inner, contentStyle]}>
          {children}
        </ScrollView>
      </View>
    );
  }
  return <View style={[outer, inner, contentStyle]}>{children}</View>;
}
