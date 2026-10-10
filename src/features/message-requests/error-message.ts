import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<"message-requests">>;

export function messageRequestErrorMessage(t: T, code: string): string {
  if (code.startsWith("message_requests.")) {
    const leaf = code.replace("message_requests.", "");
    return t(`errors.message_requests.${leaf}` as "errors.message_requests.not_allowed");
  }
  if (code.startsWith("platform.")) {
    const leaf = code.replace("platform.", "");
    return t(`errors.platform.${leaf}` as "errors.platform.unauthenticated");
  }
  return code;
}
