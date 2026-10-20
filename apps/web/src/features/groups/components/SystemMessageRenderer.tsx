"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@pulse/core/timeline";

import { useGroupMemberName } from "../hooks/useGroupMemberNames";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function readEvent(metadata: Record<string, unknown> | null | undefined): {
  event: string | null;
  subjectUserId: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { event: null, subjectUserId: null };
  }
  const event =
    typeof metadata.event === "string" ? metadata.event : null;
  const subjectUserId =
    typeof metadata.subjectUserId === "string" ? metadata.subjectUserId : null;
  return { event, subjectUserId };
}

function SystemMessageRendererInner({ message }: Props) {
  const t = useTranslations("groups");
  const { event, subjectUserId } = useMemo(
    () => readEvent(message.metadata),
    [message.metadata],
  );
  const subjectName = useGroupMemberName(
    message.conversation_id,
    subjectUserId,
  );

  if (!event) {
    return <span className="bidi-auto">{t("system.fallback")}</span>;
  }

  const key = `system.events.${event}` as
    | "system.events.joined"
    | "system.events.left"
    | "system.events.removed"
    | "system.events.promoted"
    | "system.events.demoted";

  return (
    <span className="bidi-auto">
      {t(key, { name: subjectName ?? t("system.unknownMember") })}
    </span>
  );
}

export const SystemMessageRenderer = memo(SystemMessageRendererInner);
