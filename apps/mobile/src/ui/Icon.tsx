import type { LucideIcon } from "lucide-react-native";
import { I18nManager } from "react-native";

import { useTheme } from "./ThemeProvider";

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  /** Theme color token name; defaults to `icon`. */
  tone?: "icon" | "text" | "textMuted" | "accent" | "danger" | "accentContrast" | "textDisabled";
  /** Explicit color; wins over tone. */
  color?: string;
  strokeWidth?: number;
  /** Mirror in RTL (back/forward arrows, chevrons). */
  flipRtl?: boolean;
}

export function Icon({ icon: Glyph, size = 24, tone = "icon", color, strokeWidth = 2, flipRtl }: IconProps) {
  const { colors } = useTheme();
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      color={color ?? colors[tone]}
      style={flipRtl && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
