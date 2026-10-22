import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { getColors, Text, useTheme, type ThemeAccent, type ThemeMode } from "@/ui";

/** The web ui.radio: a 20px ring with an accent dot when checked. */
export function Radio({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: checked ? colors.accent : colors.borderStrong,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
    </View>
  );
}

/** The web settingsCard: a bordered card with a muted description on top. */
export function SettingsCard({ hint, children }: { hint: string; children: ReactNode }) {
  const { colors, spacing, radii } = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.card,
        backgroundColor: colors.card,
        marginHorizontal: spacing.s16,
        marginTop: spacing.s16,
        overflow: "hidden",
      }}
    >
      <View style={{ padding: spacing.s16 }}>
        <Text variant="caption" tone="textMuted">
          {hint}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** The web themeCards grid of radio cards. */
export function OptionCardGrid({ label, children }: { label: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.s12, paddingHorizontal: spacing.s16, paddingBottom: spacing.s16 }}
    >
      {children}
    </View>
  );
}

export function OptionCard(props: { label: string; checked: boolean; onPress: () => void; preview: ReactNode }) {
  const { colors, spacing, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: props.checked }}
      onPress={props.onPress}
      style={{
        flexGrow: 1,
        flexBasis: 140,
        gap: spacing.s8,
        padding: spacing.s8,
        borderWidth: 2,
        borderColor: props.checked ? colors.accent : colors.border,
        borderRadius: radii.card,
      }}
    >
      {props.preview}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8, paddingHorizontal: spacing.s4 }}>
        <Radio checked={props.checked} />
        <Text>{props.label}</Text>
      </View>
    </Pressable>
  );
}

function PreviewHalf({ mode, accent }: { mode: ThemeMode; accent: ThemeAccent }) {
  const { spacing } = useTheme();
  const c = getColors(mode, accent);
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: spacing.s4, padding: spacing.s4, backgroundColor: c.bg }}>
      <View style={{ width: "20%", borderRadius: 4, backgroundColor: c.card }} />
      <View style={{ flex: 1, borderRadius: 4, backgroundColor: c.card }} />
    </View>
  );
}

/** The web themePreview: a sidebar and pane in that theme; system shows light and dark halves. */
export function ThemePreview({ theme, accent }: { theme: "system" | ThemeMode; accent: ThemeAccent }) {
  const { radii } = useTheme();
  return (
    <View style={{ height: 84, borderRadius: radii.control, overflow: "hidden", flexDirection: "row" }}>
      {theme === "system" ? (
        <>
          <PreviewHalf mode="light" accent={accent} />
          <PreviewHalf mode="dark" accent={accent} />
        </>
      ) : (
        <PreviewHalf mode={theme} accent={accent} />
      )}
    </View>
  );
}

/** The web accentSwatch: an incoming bubble, an outgoing bubble and an accent bar in that accent. */
export function AccentSwatch({ accent, mode }: { accent: ThemeAccent; mode: ThemeMode }) {
  const { spacing, radii } = useTheme();
  const c = getColors(mode, accent);
  const bar = { height: 14, borderRadius: 7 } as const;
  return (
    <View
      style={{ height: 84, justifyContent: "center", gap: spacing.s4, padding: spacing.s8, borderRadius: radii.control, backgroundColor: c.bg }}
    >
      <View style={[bar, { width: "55%", backgroundColor: c.card }]} />
      <View style={[bar, { width: "65%", alignSelf: "flex-end", backgroundColor: c.bubbleOut }]} />
      <View style={[bar, { width: "36%", backgroundColor: c.accent }]} />
    </View>
  );
}
