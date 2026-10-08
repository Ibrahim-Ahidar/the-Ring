"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import { getContributions } from "@/shell/slots";

import { pickMessageRenderer } from "../lib/message-renderer-pick";
import { TextMessageRenderer } from "./TextMessageRenderer";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function MessageRendererHostInner({ message, currentUserId }: Props) {
  const t = useTranslations("direct-messaging");
  const renderers = useMemo(() => getContributions("messageRenderer"), []);

  if (message.deletion_scope === "everyone") {
    return <p className="dm-tombstone">{t("messageDeleted")}</p>;
  }

  const match = pickMessageRenderer(renderers, message.type);
  const Component = match?.Component;

  if (Component) {
    return <Component message={message} currentUserId={currentUserId} />;
  }

  if (message.type === "text") {
    return (
      <TextMessageRenderer message={message} currentUserId={currentUserId} />
    );
  }

  if (message.type === "system") {
    return <p>{message.body ?? t("systemMessage")}</p>;
  }

  return <p>{t("messageUnavailable")}</p>;
}

export const MessageRendererHost = memo(MessageRendererHostInner);
