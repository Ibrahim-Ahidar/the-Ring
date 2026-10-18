import { DEFAULT_ACCENT, type Accent, type Locale, type Theme } from "@/shell/locale";

export type AppearanceState = {
  locale: Locale;
  theme: Theme;
  accent: Accent;
  paletteOpen: boolean;
  paletteQuery: string;
  highlightedIndex: number;
  helpOpen: boolean;
};

export type AppearanceAction =
  | { type: "sync_preferences"; locale: Locale; theme: Theme }
  | { type: "open_palette" }
  | { type: "close_palette" }
  | { type: "set_palette_query"; query: string; maxIndex: number }
  | { type: "move_highlight"; delta: number; maxIndex: number }
  | { type: "set_highlight"; index: number }
  | { type: "open_help" }
  | { type: "close_help" }
  | { type: "set_locale"; locale: Locale }
  | { type: "set_theme"; theme: Theme }
  | { type: "set_accent"; accent: Accent };

export const initialAppearanceState = (
  locale: Locale,
  theme: Theme,
  accent: Accent = DEFAULT_ACCENT,
): AppearanceState => ({
  locale,
  theme,
  accent,
  paletteOpen: false,
  paletteQuery: "",
  highlightedIndex: 0,
  helpOpen: false,
});

function clampIndex(index: number, maxIndex: number): number {
  if (maxIndex < 0) {
    return 0;
  }
  if (index < 0) {
    return maxIndex;
  }
  if (index > maxIndex) {
    return 0;
  }
  return index;
}

export function appearanceReducer(
  state: AppearanceState,
  action: AppearanceAction,
): AppearanceState {
  switch (action.type) {
    case "sync_preferences":
      return { ...state, locale: action.locale, theme: action.theme };
    case "open_palette":
      return {
        ...state,
        paletteOpen: true,
        paletteQuery: "",
        highlightedIndex: 0,
        helpOpen: false,
      };
    case "close_palette":
      return {
        ...state,
        paletteOpen: false,
        paletteQuery: "",
        highlightedIndex: 0,
      };
    case "set_palette_query":
      return {
        ...state,
        paletteQuery: action.query,
        highlightedIndex: clampIndex(0, action.maxIndex),
      };
    case "move_highlight":
      return {
        ...state,
        highlightedIndex: clampIndex(
          state.highlightedIndex + action.delta,
          action.maxIndex,
        ),
      };
    case "set_highlight":
      return { ...state, highlightedIndex: action.index };
    case "open_help":
      return { ...state, helpOpen: true, paletteOpen: false };
    case "close_help":
      return { ...state, helpOpen: false };
    case "set_locale":
      return { ...state, locale: action.locale };
    case "set_theme":
      return { ...state, theme: action.theme };
    case "set_accent":
      return { ...state, accent: action.accent };
    default:
      return state;
  }
}
