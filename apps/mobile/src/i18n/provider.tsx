import ar from "@pulse/i18n/messages/ar.json";
import en from "@pulse/i18n/messages/en.json";
import fr from "@pulse/i18n/messages/fr.json";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";

import { usePreferences } from "@/settings/PreferencesProvider";

const catalogs = { ar, en, fr } as const;

export function AppIntlProvider({ children }: { children: ReactNode }) {
  const { language } = usePreferences();
  return (
    <IntlProvider locale={language} messages={catalogs[language]}>
      {children}
    </IntlProvider>
  );
}
