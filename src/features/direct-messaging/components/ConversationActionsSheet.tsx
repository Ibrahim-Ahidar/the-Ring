"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import type { ListItemMenuContext, ListItemMenuContribution } from "@/shell/slots/types";
import ui from "@/shell/styles/ui.module.css";

import { useFocusTrap } from "@/features/conversation-organization/hooks/useFocusTrap";
import styles from "../direct-messaging.module.css";

type Props = {
  title: string;
  menus: ListItemMenuContribution[];
  ctx: ListItemMenuContext;
  onClose: () => void;
};

/** Bottom sheet with the same actions as a chat row's inline menu. */
export const ConversationActionsSheet = memo(function ConversationActionsSheet({
  title,
  menus,
  ctx,
  onClose,
}: Props) {
  const t = useTranslations("direct-messaging");
  const tFeature = useTranslations();
  const trapRef = useFocusTrap(true);

  return (
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={trapRef}
        className={`${ui.menu} ${styles.rowSheet}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${t("chatActions")}: ${title}`}
      >
        <h2 className={styles.rowSheetTitle}>{title}</h2>
        <ul className={styles.rowSheetList}>
          {menus.map((menu) => {
            const Icon = menu.icon;
            return (
              <li key={menu.id}>
                <button
                  type="button"
                  className={`${ui.menuItem} ${menu.destructive ? ui.menuItemDanger : ""}`}
                  onClick={() => {
                    onClose();
                    void menu.run(ctx);
                  }}
                >
                  <Icon aria-hidden />
                  {tFeature(menu.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
        <hr className={ui.menuSep} />
        <button type="button" className={ui.menuItem} onClick={onClose}>
          {t("closeSheet")}
        </button>
      </div>
    </div>
  );
});
