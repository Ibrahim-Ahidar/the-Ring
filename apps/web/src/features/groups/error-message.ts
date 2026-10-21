import type { useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations<"groups">>;

export function groupsErrorMessage(t: Translator, code: string): string {
  if (code.startsWith("groups.")) {
    const key = code.slice("groups.".length);
    return t(`errors.groups.${key}` as `errors.groups.${string}`);
  }
  if (code.startsWith("safety.")) {
    return t("errors.generic");
  }
  return t("errors.generic");
}
