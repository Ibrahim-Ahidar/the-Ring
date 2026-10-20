import ar from "@pulse/i18n/messages/ar.json";
import en from "@pulse/i18n/messages/en.json";
import fr from "@pulse/i18n/messages/fr.json";
import { getLocales } from "expo-localization";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";

const catalogs = { ar, en, fr } as const;
type Locale = keyof typeof catalogs;

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code && code in catalogs ? (code as Locale) : "en";
}

export function AppIntlProvider({ children }: { children: ReactNode }) {
  const locale = deviceLocale();
  return (
    <IntlProvider locale={locale} messages={catalogs[locale]}>
      {children}
    </IntlProvider>
  );
}
