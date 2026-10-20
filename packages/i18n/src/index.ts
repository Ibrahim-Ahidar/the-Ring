export const LOCALES = ["ar", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

/** Base (shell) catalogs shared by every client. */
export const shellCatalogs = {
  ar: () => import("../messages/ar.json").then((m) => m.default),
  en: () => import("../messages/en.json").then((m) => m.default),
  fr: () => import("../messages/fr.json").then((m) => m.default),
} as const;
