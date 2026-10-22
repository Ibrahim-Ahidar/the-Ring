import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { Banner, Screen, Text, useTheme } from "@/ui";

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  /** Error text shown in a Banner above the form. */
  error?: string | null;
  /** Success / info text shown in a Banner. */
  info?: string | null;
  children: ReactNode;
  /** Footer row (switch-to-other-screen links). */
  footer?: ReactNode;
}

/** Shared auth layout: centered card-width column, title + subtitle, form fields, footer links. */
export function AuthShell({ title, subtitle, error, info, children, footer }: AuthShellProps) {
  const { spacing } = useTheme();
  return (
    <Screen background="bg">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen scroll padded edges={[]} contentStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.s16, paddingVertical: spacing.s24 }}>
          <View style={{ gap: spacing.s24, width: "100%", maxWidth: 420, alignSelf: "center" }}>
            <View style={{ gap: spacing.s8 }}>
              <Text variant="title" accessibilityRole="header" style={{ fontSize: 28, letterSpacing: -0.28 }}>
                {title}
              </Text>
              {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
            </View>
            {error ? <Banner kind="error" message={error} /> : null}
            {info ? <Banner kind="info" message={info} /> : null}
            <View style={{ gap: spacing.s16 }}>{children}</View>
            {footer ? <View style={{ alignItems: "center", gap: spacing.s4 }}>{footer}</View> : null}
            <LegalNotice />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The web AuthFrame footer: agreement line linking the terms and privacy pages. */
function LegalNotice() {
  const t = useTranslations("mobile.identity");
  const router = useRouter();
  const link = (kind: "terms" | "privacy") => (chunks: ReactNode) => (
    <Text variant="caption" tone="link" accessibilityRole="link" onPress={() => router.push(`/legal/${kind}`)}>
      {chunks}
    </Text>
  );
  return (
    <Text variant="caption" tone="textMuted" style={{ textAlign: "center" }}>
      {t.rich("legalNotice", { terms: link("terms"), privacy: link("privacy") })}
    </Text>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { controlHeights } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ minHeight: controlHeights.hit, justifyContent: "center", alignItems: "center" }}
    >
      <Text variant="bodyStrong" tone="link">
        {label}
      </Text>
    </Pressable>
  );
}
