import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { useTheme } from "./ThemeProvider";
import { lineHeightRatio, type ColorTokens } from "./theme";

export type TextVariant = "title" | "heading" | "body" | "bodyStrong" | "caption" | "label" | "muted" | "micro";
export type TextTone = keyof Pick<
  ColorTokens,
  "text" | "textMuted" | "textDisabled" | "accent" | "accentStrong" | "danger" | "link" | "accentContrast"
>;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

const SPEC: Record<
  TextVariant,
  { size: "xs" | "sm" | "md" | "lg" | "xl" | "xxl"; weight: "regular" | "medium" | "bold"; tone: TextTone }
> = {
  title: { size: "xxl", weight: "bold", tone: "text" },
  heading: { size: "xl", weight: "bold", tone: "text" },
  body: { size: "lg", weight: "regular", tone: "text" },
  bodyStrong: { size: "lg", weight: "medium", tone: "text" },
  label: { size: "md", weight: "medium", tone: "text" },
  caption: { size: "sm", weight: "regular", tone: "textMuted" },
  muted: { size: "md", weight: "regular", tone: "textMuted" },
  micro: { size: "xs", weight: "regular", tone: "textMuted" },
};

export function Text({ variant = "body", tone, style, ...rest }: TextProps) {
  const { colors, fontSizes, fontWeights } = useTheme();
  const spec = SPEC[variant];
  const size = fontSizes[spec.size];
  const base: TextStyle = {
    color: colors[tone ?? spec.tone],
    fontSize: size,
    lineHeight: Math.round(size * lineHeightRatio),
    fontWeight: fontWeights[spec.weight],
    // Mixed Arabic / Latin content takes the direction of its own text.
    writingDirection: "auto",
  };
  return (
    <RNText
      accessibilityRole={variant === "title" || variant === "heading" ? "header" : undefined}
      {...rest}
      style={[base, style]}
    />
  );
}
