"use client";

import { memo, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import type { ListItemMenuContext, ListItemMenuContribution } from "@/shell/slots/types";

import { useFocusTrap } from "../hooks/useFocusTrap";
import type { MenuPoint } from "../hooks/useBubbleContextMenu";
import { computeMenuPosition } from "./menuPosition";
import styles from "../direct-messaging.module.css";

type Props = {
  title: string;
  menus: ListItemMenuContribution[];
  ctx: ListItemMenuContext;
  /** Pointer position the menu opens at; without one it falls back to a sheet. */
  point: MenuPoint | null;
  onClose: () => void;
};

const isMobileSheet = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 767px)").matches;

type Placement = { top: number; left: number } | "sheet" | null;

/**
 * A chat row's actions, shown straight away: a floating menu at the pointer on
 * desktop, a bottom sheet on narrow screens. Shares the message menu's look
 * and its positioning.
 */
export const ConversationActionsSheet = memo(function ConversationActionsSheet({
  title,
  menus,
  ctx,
  point,
  onClose,
}: Props) {
  const t = useTranslations("direct-messaging");
  const tFeature = useTranslations();
  const trapRef = useFocusTrap(true);
  const [placement, setPlacement] = useState<Placement>(null);

  useLayoutEffect(() => {
    const panel = trapRef.current;
    if (!panel) {
      return;
    }
    if (!point || isMobileSheet()) {
      setPlacement("sheet");
      return;
    }
    const rect = panel.getBoundingClientRect();
    const { top, left } = computeMenuPosition(
      { top: point.y, bottom: point.y, left: point.x, right: point.x },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      document.documentElement.dir === "rtl" ? "rtl" : "ltr",
    );
    setPlacement({ top, left });
  }, [point, trapRef]);

  useEffect(() => {
    const panel = trapRef.current;
    if (!panel) {
      return;
    }
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && panel.contains(event.target))) {
        onClose();
      }
    };
    panel.addEventListener("dm-action-menu-close", onClose);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      panel.removeEventListener("dm-action-menu-close", onClose);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, trapRef]);

  const panelStyle =
    placement === null
      ? ({ visibility: "hidden" } as const)
      : placement === "sheet"
        ? undefined
        : { top: placement.top, left: placement.left };

  const primary = menus.filter((menu) => !menu.destructive);
  const destructive = menus.filter((menu) => menu.destructive);

  const renderItem = (menu: ListItemMenuContribution) => {
    const Icon = menu.icon;
    return (
      <li key={menu.id} role="none">
        <button
          type="button"
          role="menuitem"
          className={styles.actionMenuItem}
          onClick={() => {
            onClose();
            void menu.run(ctx);
          }}
        >
          <Icon size={18} aria-hidden />
          <span>{tFeature(menu.labelKey)}</span>
        </button>
      </li>
    );
  };

  return createPortal(
    <>
      <button
        type="button"
        className={styles.actionMenuBackdrop}
        aria-label={t("closeActionMenu")}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={trapRef}
        className={styles.actionMenuPanel}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`${t("chatActions")}: ${title}`}
      >
        {primary.length > 0 ? (
          <ul role="menu" className={styles.actionMenuList}>
            {primary.map(renderItem)}
          </ul>
        ) : null}
        {primary.length > 0 && destructive.length > 0 ? (
          <hr className={styles.actionMenuDivider} />
        ) : null}
        {destructive.length > 0 ? (
          <ul role="menu" className={styles.actionMenuList} data-tone="danger">
            {destructive.map(renderItem)}
          </ul>
        ) : null}
      </div>
    </>,
    document.body,
  );
});
