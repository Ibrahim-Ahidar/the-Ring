import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

export function organizationErrorMessage(t: T, code: string | undefined): string {
  if (!code) {
    return t("errors/generic");
  }
  const parts = code.split(".");
  if (parts.length === 2) {
    return t(`errors.${parts[0]}.${parts[1]}`);
  }
  return t("errors/generic");
}
