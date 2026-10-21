/**
 * Pulse mobile design tokens. Names mirror apps/web/src/shell/styles/tokens.css
 * (camelCased: --color-text-muted -> colors.textMuted). Every color has a light and
 * a dark value; `accent: "green"` applies the web "classic" palette overrides.
 */

export interface ColorTokens {
  // Surfaces
  bg: string;
  panel: string;
  card: string;
  modal: string;
  elevated: string;
  input: string;
  hover: string;
  selected: string;
  pressed: string;
  overlay: string;
  // Content
  text: string;
  textMuted: string;
  textDisabled: string;
  icon: string;
  border: string;
  borderStrong: string;
  // Accent
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentContrast: string;
  focus: string;
  // Status
  danger: string;
  dangerSoft: string;
  warning: string;
  online: string;
  read: string;
  link: string;
  // Conversation
  chatBg: string;
  chatPattern: string;
  bubbleIn: string;
  bubbleOut: string;
  bubbleMeta: string;
  quote: string;
  system: string;
  // Avatar fallbacks + sender names
  avatar1: string;
  avatar2: string;
  avatar3: string;
  avatar4: string;
  avatar5: string;
  avatar6: string;
  avatarText: string;
  sender1: string;
  sender2: string;
  sender3: string;
  sender4: string;
}

export type ThemeMode = "light" | "dark";
export type ThemeAccent = "indigo" | "green";

export const lightColors: ColorTokens = {
  bg: "#f6f7f9",
  panel: "#ffffff",
  card: "#ffffff",
  modal: "#ffffff",
  elevated: "#ffffff",
  input: "#eceef3",
  hover: "rgba(100, 110, 140, 0.12)",
  selected: "rgba(79, 70, 229, 0.12)",
  pressed: "rgba(0, 0, 0, 0.12)",
  overlay: "rgba(0, 0, 0, 0.32)",
  text: "#0a0a0a",
  textMuted: "rgba(0, 0, 0, 0.6)",
  textDisabled: "#b3b8c4",
  icon: "#535b6c",
  border: "rgba(0, 0, 0, 0.1)",
  borderStrong: "#8d93a3",
  accent: "#4f46e5",
  accentStrong: "#3730a3",
  accentSoft: "#e0e7ff",
  accentContrast: "#ffffff",
  focus: "#4f46e5",
  danger: "#ea0038",
  dangerSoft: "#ffe5ea",
  warning: "#ffeecd",
  online: "#25d366",
  read: "#0284c7",
  link: "#027eb5",
  chatBg: "#eef0f5",
  chatPattern: "rgba(60, 70, 110, 0.05)",
  bubbleIn: "#ffffff",
  bubbleOut: "#e0e7ff",
  bubbleMeta: "rgba(0, 0, 0, 0.45)",
  quote: "rgba(0, 0, 0, 0.05)",
  system: "#ffffff",
  avatar1: "#ffd7c2",
  avatar2: "#c9e7ff",
  avatar3: "#dccbff",
  avatar4: "#ffe3a3",
  avatar5: "#c4f1dd",
  avatar6: "#ffcfe0",
  avatarText: "rgba(0, 0, 0, 0.7)",
  sender1: "#c4532d",
  sender2: "#1f7aec",
  sender3: "#8a3ffc",
  sender4: "#a1690c",
};

export const darkColors: ColorTokens = {
  bg: "#121318",
  panel: "#121318",
  card: "#17181d",
  modal: "#17181d",
  elevated: "#1e2026",
  input: "#26282f",
  hover: "rgba(255, 255, 255, 0.06)",
  selected: "rgba(129, 140, 248, 0.16)",
  pressed: "rgba(255, 255, 255, 0.16)",
  overlay: "rgba(0, 0, 0, 0.32)",
  text: "#fafafa",
  textMuted: "rgba(255, 255, 255, 0.6)",
  textDisabled: "#5d6270",
  icon: "#a9b0c0",
  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "#6f7585",
  accent: "#818cf8",
  accentStrong: "#e0e7ff",
  accentSoft: "#25264d",
  accentContrast: "#0a0a0a",
  focus: "#818cf8",
  danger: "#fb5061",
  dangerSoft: "#3b1219",
  warning: "#3a3121",
  online: "#25d366",
  read: "#38bdf8",
  link: "#53bdeb",
  chatBg: "#0e0f13",
  chatPattern: "rgba(255, 255, 255, 0.035)",
  bubbleIn: "#1e2026",
  bubbleOut: "#2d2f6e",
  bubbleMeta: "rgba(255, 255, 255, 0.6)",
  quote: "rgba(0, 0, 0, 0.22)",
  system: "#17181d",
  avatar1: "#5e3a2a",
  avatar2: "#1f4560",
  avatar3: "#3d2f63",
  avatar4: "#5a4718",
  avatar5: "#1f4c3a",
  avatar6: "#5a2338",
  avatarText: "rgba(255, 255, 255, 0.85)",
  sender1: "#ff8f6b",
  sender2: "#7fb8ff",
  sender3: "#c4a2ff",
  sender4: "#ffc857",
};

/** Web `[data-accent="green"]` overrides (the pre-indigo "classic" palette). */
const greenOverrides: Record<ThemeMode, Partial<ColorTokens>> = {
  light: {
    bg: "#f7f5f3",
    input: "#f0eeec",
    hover: "rgba(194, 189, 184, 0.18)",
    selected: "rgba(194, 189, 184, 0.3)",
    textDisabled: "#bdbdbd",
    icon: "#54585a",
    borderStrong: "#959393",
    accent: "#1daa61",
    accentStrong: "#15603e",
    accentSoft: "#d9fdd3",
    focus: "#1daa61",
    read: "#007bfc",
    chatBg: "#f5f1eb",
    chatPattern: "rgba(0, 0, 0, 0.045)",
    bubbleOut: "#d9fdd3",
  },
  dark: {
    bg: "#161717",
    panel: "#161717",
    card: "#1d1f1f",
    modal: "#1d1f1f",
    elevated: "#242626",
    input: "#2e2f2f",
    selected: "rgba(255, 255, 255, 0.1)",
    textDisabled: "#5c5e5f",
    icon: "#aebac1",
    borderStrong: "#757778",
    accent: "#21c063",
    accentStrong: "#d9fdd3",
    accentSoft: "#103529",
    focus: "#21c063",
    read: "#53bdeb",
    chatBg: "#101111",
    bubbleIn: "#242626",
    bubbleOut: "#144d37",
    system: "#1d1f1f",
  },
};

export const spacing = { s2: 2, s4: 4, s8: 8, s12: 12, s16: 16, s24: 24, s32: 32 } as const;

export const radii = { control: 8, bubble: 8, card: 12, pill: 999 } as const;

export const fontSizes = { xs: 11, sm: 13, md: 14.5, lg: 16, xl: 19, xxl: 22 } as const;
/** Arabic body text is larger on the web ([lang="ar"] --text-md: 15.5px). */
export const arabicMdFontSize = 15.5;

export const fontWeights = { regular: "400", medium: "500", bold: "600" } as const;

/** The web body line-height is 1.45. */
export const lineHeightRatio = 1.45;

export const controlHeights = {
  /** Web button / icon button / search height. */
  control: 40,
  controlSm: 32,
  /** Platform minimum touch target. */
  hit: 44,
  header: 60,
  row: 72,
  listRow: 56,
} as const;

export const borderWidths = { hairline: 1, focus: 2 } as const;

export const motion = { fast: 120, medium: 180, slow: 220 } as const;

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

const shadow = (height: number, opacity: number, radius: number, elevation: number): ShadowStyle => ({
  shadowColor: "#0b141a",
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const shadows = {
  bubble: shadow(1, 0.13, 0.5, 1),
  menu: shadow(2, 0.26, 5, 6),
  modal: shadow(12, 0.24, 15, 16),
} as const;

export interface Theme {
  mode: ThemeMode;
  accent: ThemeAccent;
  isDark: boolean;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  fontSizes: typeof fontSizes;
  fontWeights: typeof fontWeights;
  controlHeights: typeof controlHeights;
  shadows: typeof shadows;
  motion: typeof motion;
}

export function getColors(mode: ThemeMode, accent: ThemeAccent = "indigo"): ColorTokens {
  const base = mode === "dark" ? darkColors : lightColors;
  return accent === "green" ? { ...base, ...greenOverrides[mode] } : base;
}

export function createTheme(mode: ThemeMode, accent: ThemeAccent = "indigo"): Theme {
  return {
    mode,
    accent,
    isDark: mode === "dark",
    colors: getColors(mode, accent),
    spacing,
    radii,
    fontSizes,
    fontWeights,
    controlHeights,
    shadows,
    motion,
  };
}

/** Fallback colors for avatars, picked by a stable hash (web avatarColourIndex). */
export function avatarColor(colors: ColorTokens, index: number): string {
  const list = [colors.avatar1, colors.avatar2, colors.avatar3, colors.avatar4, colors.avatar5, colors.avatar6];
  return list[index % list.length]!;
}
