"use client";

import { useEffect, useState } from "react";

import { reportError } from "@/platform/telemetry";
import { LOCALE_COOKIE, isLocale, isRtl, type Locale } from "@/shell/locale";

import en from "@/shell/messages/en.json";

type Catalog = typeof en;

/** `en` stays static so the page renders even if chunk loading is broken. */
const lazyCatalogs: Record<Exclude<Locale, "en">, () => Promise<Catalog>> = {
  ar: () => import("@/shell/messages/ar.json").then((m) => m.default),
  fr: () => import("@/shell/messages/fr.json").then((m) => m.default),
};

/** Root layout is gone here, so there is no intl provider: read the locale cookie directly. */
function readLocale(): Locale {
  if (typeof document === "undefined") {
    return "en";
  }
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];
  return match && isLocale(match) ? match : "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  const locale = readLocale();
  const [catalog, setCatalog] = useState<Catalog>(en);

  useEffect(() => {
    if (locale === "en") {
      return;
    }
    let active = true;
    lazyCatalogs[locale]().then(
      (loaded) => {
        if (active) {
          setCatalog(loaded);
        }
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [locale]);

  const t = catalog.errors;

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} suppressHydrationWarning>
      <body>
        <div role="alert" style={{ padding: "2rem" }}>
          <h1>{t.title}</h1>
          <p>{t.body}</p>
          {error.digest ? <p>{t.reference.replace("{digest}", error.digest)}</p> : null}
          <button type="button" onClick={reset}>
            {t.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
