import { CircleAlert, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Optional call to action, e.g. <Button/>. */
  action?: ReactNode;
}

/** Centered "nothing here" block. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  const { colors, spacing, radii } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.s12, padding: spacing.s24 }}>
      {icon ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radii.pill,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={icon} size={32} tone="accent" />
        </View>
      ) : null}
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {description ? (
        <Text variant="muted" style={{ textAlign: "center", maxWidth: 320 }}>
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Centered failure block with an optional Retry button (web LoadFailed / ErrorScreen). */
export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Try again" }: ErrorStateProps) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      description={message}
      action={onRetry ? <Button title={retryLabel} onPress={onRetry} variant="secondary" /> : undefined}
    />
  );
}
