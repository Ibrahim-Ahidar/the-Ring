import type { ConversationDetail } from "../types";

type Translate = (key: "groupFallback" | "directFallback") => string;

export function conversationTitle(detail: ConversationDetail, t: Translate): string {
  return detail.type === "group"
    ? (detail.title ?? t("groupFallback"))
    : (detail.other_display_name ?? detail.other_username ?? t("directFallback"));
}
