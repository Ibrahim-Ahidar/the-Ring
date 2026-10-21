import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Builds a `generateMetadata` that titles a route from `shell.routes.<key>`. */
export function routeTitle(key: string): () => Promise<Metadata> {
  return async () => {
    const t = await getTranslations("shell");
    return { title: t(`routes.${key}`) };
  };
}
