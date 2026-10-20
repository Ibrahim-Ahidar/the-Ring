import { getRequestConfig } from "next-intl/server";

import { featureMessageLoaders } from "@/shell/generated/feature-messages";
import { resolveLocale, resolveTimeZone } from "@/shell/preferences";

const shellCatalogs = {
  ar: () => import("@/shell/messages/ar.json").then((m) => m.default),
  en: () => import("@/shell/messages/en.json").then((m) => m.default),
  fr: () => import("@/shell/messages/fr.json").then((m) => m.default),
} as const;

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const timeZone = await resolveTimeZone();
  const [shellMessages, featureLocaleMessages] = await Promise.all([
    shellCatalogs[locale](),
    featureMessageLoaders[locale](),
  ]);

  return {
    locale,
    timeZone,
    messages: {
      shell: shellMessages,
      ...featureLocaleMessages,
    },
  };
});
