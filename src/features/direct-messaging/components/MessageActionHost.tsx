"use client";

import { memo, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import { getContributions } from "@/shell/slots";

type Props = {
  message: TimelineMessage;
  conversationId: string;
  currentUserId: string;
  conversationType: "direct" | "group";
};

function MessageActionHostInner({
  message,
  conversationId,
  currentUserId,
  conversationType,
}: Props) {
  const t = useTranslations("direct-messaging");
  const [open, setOpen] = useState(false);
  const actions = useMemo(() => getContributions("messageAction"), []);
  const available = actions.filter((action) =>
    action.isAvailable({
      message,
      conversationId,
      currentUserId,
      conversationType,
    }),
  );

  if (available.length === 0) {
    return null;
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="shell-nav-link"
        aria-label={t("messageActions")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open ? (
        <ul
          role="menu"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            zIndex: 2,
            background: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
            padding: "var(--space-8)",
            listStyle: "none",
            margin: 0,
          }}
        >
          {available.map((action) => (
            <li key={action.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void action.run({
                    message,
                    conversationId,
                    currentUserId,
                    conversationType,
                  });
                }}
              >
                {action.labelKey}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const MessageActionHost = memo(MessageActionHostInner);
