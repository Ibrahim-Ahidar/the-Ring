"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";
import type { MemberRole } from "@/shell/slots/types";
import { featureLabelKey } from "@/shell/slots/merge";
import { getContributions } from "@/shell/slots";

import { useFocusTrap } from "../hooks/useFocusTrap";
import styles from "../direct-messaging.module.css";

type Props = {
  message: TimelineMessage;
  conversationId: string;
  currentUserId: string;
  conversationType: "direct" | "group";
  role?: MemberRole;
};

function isDestructive(action: {
  destructive?: boolean;
  tone?: "default" | "danger";
}): boolean {
  return Boolean(action.destructive || action.tone === "danger");
}

function MessageActionHostInner({
  message,
  conversationId,
  currentUserId,
  conversationType,
  role,
}: Props) {
  const t = useTranslations("direct-messaging");
  const tFeature = useTranslations();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trapRef = useFocusTrap(open);
  const actions = useMemo(() => getContributions("messageAction"), []);

  const ctx = useMemo(
    () => ({
      message,
      conversationId,
      currentUserId,
      conversationType,
      role,
    }),
    [conversationId, conversationType, currentUserId, message, role],
  );

  const { primary, destructive } = useMemo(() => {
    const primaryItems: typeof actions = [];
    const destructiveItems: typeof actions = [];
    for (const action of actions) {
      if (isDestructive(action)) {
        destructiveItems.push(action);
      } else {
        primaryItems.push(action);
      }
    }
    return { primary: primaryItems, destructive: destructiveItems };
  }, [actions]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = trapRef.current;
    if (!panel) {
      return;
    }
    const onCloseEvent = () => close();
    panel.addEventListener("dm-action-menu-close", onCloseEvent);
    return () => panel.removeEventListener("dm-action-menu-close", onCloseEvent);
  }, [close, open, trapRef]);

  if (actions.length === 0) {
    return null;
  }

  const renderAction = (action: (typeof actions)[number]) => {
    const available = action.isAvailable(ctx);
    const label = tFeature(action.labelKey!);
    const Icon = action.icon;
    let disabledReason: string | undefined;
    if (!available && action.unavailableReasonKey) {
      const reasonKey = action.unavailableReasonKey(ctx);
      if (reasonKey) {
        disabledReason = tFeature(featureLabelKey(action.feature, reasonKey));
      }
    }
    if (!available && !disabledReason) {
      return null;
    }

    return (
      <li key={action.id} role="none">
        <button
          type="button"
          role="menuitem"
          className={styles.actionMenuItem}
          disabled={!available}
          title={disabledReason}
          aria-describedby={
            disabledReason ? `action-reason-${action.id}` : undefined
          }
          onClick={() => {
            if (!available) {
              return;
            }
            close();
            void action.run(ctx);
          }}
        >
          <Icon size={18} aria-hidden />
          <span>{label}</span>
        </button>
        {disabledReason ? (
          <span id={`action-reason-${action.id}`} className={styles.actionMenuReason}>
            {disabledReason}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className={styles.actionMenuRoot}>
      <button
        ref={triggerRef}
        type="button"
        className="shell-nav-link"
        aria-label={t("messageActions")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className={styles.actionMenuBackdrop}
            aria-label={t("closeActionMenu")}
            onClick={close}
          />
          <div
            ref={trapRef}
            className={styles.actionMenuPanel}
            role="dialog"
            aria-modal="true"
            aria-label={t("messageActions")}
          >
            <ul role="menu" className={styles.actionMenuList}>
              {primary.map(renderAction)}
            </ul>
            {destructive.length > 0 ? (
              <>
                <hr className={styles.actionMenuDivider} />
                <ul role="menu" className={styles.actionMenuList}>
                  {destructive.map(renderAction)}
                </ul>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export const MessageActionHost = memo(MessageActionHostInner);
