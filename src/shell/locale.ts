export const LOCALES = ["ar", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "pulse_locale";
export const THEME_COOKIE = "pulse_theme";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}
