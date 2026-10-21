import { Eye, EyeOff, Search, X } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export interface TextFieldProps extends Omit<TextInputProps, "style" | "multiline"> {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Password field with a show/hide toggle. */
  secure?: boolean;
  multiline?: boolean;
  /** Lines shown for multiline (default 4). */
  lines?: number;
  /** Node placed at the end of the field (e.g. an IconButton). */
  trailing?: ReactNode;
  showLabel?: string;
  hideLabel?: string;
}

/** Labelled input: grey well (--color-input), 2px accent border on focus, danger border on error. */
export function TextField({
  label,
  hint,
  error,
  secure,
  multiline,
  lines = 4,
  trailing,
  showLabel = "Show password",
  hideLabel = "Hide password",
  editable = true,
  ...rest
}: TextFieldProps) {
  const { colors, spacing, radii, fontSizes, controlHeights } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const border = error ? colors.danger : focused ? colors.accent : "transparent";
  return (
    <View style={{ gap: spacing.s4 }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          minHeight: controlHeights.hit,
          borderRadius: radii.control,
          borderWidth: 2,
          borderColor: border,
          backgroundColor: focused ? colors.panel : colors.input,
          paddingStart: spacing.s12,
          paddingEnd: secure || trailing ? spacing.s4 : spacing.s12,
          opacity: editable ? 1 : 0.6,
        }}
      >
        <TextInput
          {...rest}
          editable={editable}
          multiline={multiline}
          numberOfLines={multiline ? lines : 1}
          secureTextEntry={secure ? hidden : rest.secureTextEntry}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: fontSizes.lg,
            paddingVertical: spacing.s8,
            minHeight: multiline ? lines * 22 : undefined,
            textAlignVertical: multiline ? "top" : "center",
            textAlign: "auto",
            writingDirection: "auto",
          }}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? showLabel : hideLabel}
            onPress={() => setHidden((h) => !h)}
            hitSlop={4}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Icon icon={hidden ? Eye : EyeOff} size={20} />
          </Pressable>
        ) : null}
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}

export interface SearchFieldProps extends Omit<TextInputProps, "style" | "value" | "onChangeText"> {
  value: string;
  onChangeText: (v: string) => void;
  clearLabel?: string;
}

/** Pill search input (web .search): 40px, grey well, accent border on focus, clear button. */
export function SearchField({ value, onChangeText, placeholder, clearLabel = "Clear search", ...rest }: SearchFieldProps) {
  const { colors, spacing, radii, fontSizes } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.s12,
        height: 44,
        paddingStart: spacing.s12,
        paddingEnd: spacing.s8,
        borderRadius: radii.pill,
        borderWidth: 2,
        borderColor: focused ? colors.accent : "transparent",
        backgroundColor: focused ? colors.panel : colors.input,
      }}
    >
      <Icon icon={Search} size={20} tone="textMuted" />
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={rest.accessibilityLabel ?? placeholder ?? "Search"}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={{ flex: 1, color: colors.text, fontSize: fontSizes.md, paddingVertical: 0, writingDirection: "auto", textAlign: "auto" }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={10}
          onPress={() => onChangeText("")}
          style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
        >
          <Icon icon={X} size={18} tone="textMuted" />
        </Pressable>
      ) : null}
    </View>
  );
}
