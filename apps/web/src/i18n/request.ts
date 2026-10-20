import { getRequestConfig } from "next-intl/server";

import { shellCatalogs } from "@pulse/i18n";

import { featureMessageLoaders } from "@/shell/generated/feature-messages";
import { resolveLocale, resolveTimeZone } from "@/shell/preferences";

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
