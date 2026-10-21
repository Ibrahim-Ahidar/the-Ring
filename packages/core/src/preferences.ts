export const THEMES = ["system", "light", "dark"] as const;
export const ACCENTS = ["indigo", "green"] as const;
export const LANGUAGES = ["en", "fr", "ar"] as const;

export type ThemePreference = (typeof THEMES)[number];
export type AccentPreference = (typeof ACCENTS)[number];
export type LanguagePreference = (typeof LANGUAGES)[number];

export interface Preferences {
  theme: ThemePreference;
  accent: AccentPreference;
  /** null follows the device language. */
  language: LanguagePreference | null;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", accent: "indigo", language: null };

export const ACCENT_COLORS: Record<AccentPreference, string> = {
  indigo: "#4f46e5",
  green: "#16a34a",
};

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Parses stored JSON, falling back to defaults per field. Never throws. */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      theme: isOneOf(THEMES, v.theme) ? v.theme : DEFAULT_PREFERENCES.theme,
      accent: isOneOf(ACCENTS, v.accent) ? v.accent : DEFAULT_PREFERENCES.accent,
      language: isOneOf(LANGUAGES, v.language) ? v.language : null,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function resolveLanguage(pref: LanguagePreference | null, deviceCode: string | undefined): LanguagePreference {
  if (pref) return pref;
  return isOneOf(LANGUAGES, deviceCode) ? deviceCode : "en";
}

export const isRtlLanguage = (lang: LanguagePreference): boolean => lang === "ar";

/** True when moving between languages flips the layout direction (needs a restart). */
export function directionChanges(from: LanguagePreference, to: LanguagePreference): boolean {
  return isRtlLanguage(from) !== isRtlLanguage(to);
}
