"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import { getContributions } from "@/shell/slots";

import { TextMessageRenderer } from "./TextMessageRenderer";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function MessageRendererHostInner({ message, currentUserId }: Props) {
  const t = useTranslations("direct-messaging");
  const renderers = useMemo(() => getContributions("messageRenderer"), []);
  const match = renderers.find((entry) => entry.type === message.type);
  const Component = match?.Component;

  if (message.deletion_scope === "everyone") {
    return <p className="dm-tombstone">{t("messageDeleted")}</p>;
  }

  if (message.type === "system") {
    const system = renderers.find((entry) => entry.type === "system");
    if (system?.Component) {
      return (
        <system.Component message={message} currentUserId={currentUserId} />
      );
    }
    return <p>{message.body ?? t("systemMessage")}</p>;
  }

  if (Component) {
    return <Component message={message} currentUserId={currentUserId} />;
  }

  if (message.type === "text") {
    return (
      <TextMessageRenderer message={message} currentUserId={currentUserId} />
    );
  }

  return <p>{t("messageUnavailable")}</p>;
}

export const MessageRendererHost = memo(MessageRendererHostInner);
