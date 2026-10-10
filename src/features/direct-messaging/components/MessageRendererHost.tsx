"use client";

import { Ban } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import { getContributions } from "@/shell/slots";

import { pickMessageRenderer } from "../lib/message-renderer-pick";
import { TextMessageRenderer } from "./TextMessageRenderer";
import styles from "../direct-messaging.module.css";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function MessageRendererHostInner({ message, currentUserId }: Props) {
  const t = useTranslations("direct-messaging");
  const renderers = useMemo(() => getContributions("messageRenderer"), []);

  if (message.deletion_scope === "everyone") {
    return (
      <span className={styles.deleted}>
        <Ban size={14} aria-hidden />
        <span>{t("messageDeleted")}</span>
      </span>
    );
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
    return <span className={styles.systemText}>{message.body ?? t("systemMessage")}</span>;
  }

  return <span className={styles.systemText}>{t("messageUnavailable")}</span>;
}

export const MessageRendererHost = memo(MessageRendererHostInner);
