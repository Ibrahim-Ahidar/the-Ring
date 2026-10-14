import { getRequestConfig } from "next-intl/server";

import { featureMessages } from "@/shell/generated/features";
import { resolveLocale, resolveTimeZone } from "@/shell/preferences";

import ar from "@/shell/messages/ar.json";
import en from "@/shell/messages/en.json";
import fr from "@/shell/messages/fr.json";

const shellCatalogs = { ar, en, fr } as const;

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const timeZone = await resolveTimeZone();
  const shellMessages = shellCatalogs[locale];

  const featureLocaleMessages = featureMessages[locale] ?? {};

  return {
    locale,
    timeZone,
    messages: {
      shell: shellMessages,
      ...featureLocaleMessages,
    },
  };
});
