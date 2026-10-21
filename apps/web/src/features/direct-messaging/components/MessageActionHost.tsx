"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@pulse/core/timeline";
import type { MemberRole } from "@/shell/slots/types";
import { getContributions } from "@/shell/slots";

import {
  useBubbleContextMenu,
  type MenuPoint,
} from "../hooks/useBubbleContextMenu";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { computeMenuPosition, type AnchorRect } from "./menuPosition";
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

// Only one menu may be open at a time: opening one closes the previous.
let closeCurrentMenu: (() => void) | null = null;

const isMobileSheet = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 767px)").matches;

const toRect = (r: DOMRect | undefined): AnchorRect | null =>
  r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;

type Placement = { top: number; left: number } | "sheet" | null;

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
  const [placement, setPlacement] = useState<Placement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<{
    kind: "trigger" | "point" | "bubble";
    point?: MenuPoint;
  }>({
    kind: "trigger",
  });
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
      if (!action.isAvailable(ctx)) {
        continue;
      }
      if (isDestructive(action)) {
        destructiveItems.push(action);
      } else {
        primaryItems.push(action);
      }
    }
    return { primary: primaryItems, destructive: destructiveItems };
  }, [actions, ctx]);
  const hasActions = primary.length + destructive.length > 0;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeSilently = () => setOpen(false);
    closeCurrentMenu?.();
    closeCurrentMenu = closeSilently;
    return () => {
      if (closeCurrentMenu === closeSilently) {
        closeCurrentMenu = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = trapRef.current;
    if (!panel) {
      return;
    }
    const onCloseEvent = () => close();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && panel.contains(event.target))) {
        setOpen(false);
      }
    };
    const onResize = () => setOpen(false);
    panel.addEventListener("dm-action-menu-close", onCloseEvent);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      panel.removeEventListener("dm-action-menu-close", onCloseEvent);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [close, open, trapRef]);

  // Measure after render and before paint so the panel never shows misplaced.
  useLayoutEffect(() => {
    const panel = trapRef.current;
    if (!open || !panel) {
      setPlacement(null);
      return;
    }
    if (isMobileSheet()) {
      setPlacement("sheet");
      return;
    }
    const { kind, point } = anchorRef.current;
    const anchor =
      kind === "point" && point
        ? { top: point.y, bottom: point.y, left: point.x, right: point.x }
        : toRect(
            (kind === "trigger"
              ? triggerRef.current
              : bubbleRef.current
            )?.getBoundingClientRect(),
          );
    if (!anchor) {
      setPlacement("sheet");
      return;
    }
    const rect = panel.getBoundingClientRect();
    const { top, left } = computeMenuPosition(
      anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      document.documentElement.dir === "rtl" ? "rtl" : "ltr",
    );
    setPlacement({ top, left });
  }, [open, trapRef]);

  useEffect(() => {
    bubbleRef.current = rootRef.current?.parentElement ?? null;
  });
  const openMenu = useCallback((point?: MenuPoint) => {
    anchorRef.current = point ? { kind: "point", point } : { kind: "bubble" };
    setOpen(true);
  }, []);
  useBubbleContextMenu(bubbleRef, openMenu, hasActions);

  if (!hasActions) {
    return null;
  }

  const renderAction = (action: (typeof actions)[number]) => {
    const label = tFeature(action.labelKey!);
    const Icon = action.icon;
    return (
      <li key={action.id} role="none">
        <button
          type="button"
          role="menuitem"
          className={styles.actionMenuItem}
          onClick={() => {
            close();
            void action.run(ctx);
          }}
        >
          <Icon size={18} aria-hidden />
          <span>{label}</span>
        </button>
      </li>
    );
  };

  const panelStyle =
    placement === null
      ? ({ visibility: "hidden" } as const)
      : placement === "sheet"
        ? undefined
        : { top: placement.top, left: placement.left };

  return (
    <div ref={rootRef} data-bubble-menu className={styles.actionMenuRoot}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.actionTrigger}
        aria-label={t("messageActions")}
        title={t("messageActions")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          anchorRef.current = { kind: "trigger" };
          setOpen((value) => !value);
        }}
      >
        <ChevronDown size={18} aria-hidden />
      </button>
      {open
        ? createPortal(
            <>
              <button
                type="button"
                className={styles.actionMenuBackdrop}
                aria-label={t("closeActionMenu")}
                onClick={close}
                onContextMenu={(event) => {
                  event.preventDefault();
                  close();
                }}
              />
              <div
                ref={trapRef}
                className={styles.actionMenuPanel}
                style={panelStyle}
                role="dialog"
                aria-modal="true"
                aria-label={t("messageActions")}
              >
                {primary.length > 0 ? (
                  <ul role="menu" className={styles.actionMenuList}>
                    {primary.map(renderAction)}
                  </ul>
                ) : null}
                {primary.length > 0 && destructive.length > 0 ? (
                  <hr className={styles.actionMenuDivider} />
                ) : null}
                {destructive.length > 0 ? (
                  <ul
                    role="menu"
                    className={styles.actionMenuList}
                    data-tone="danger"
                  >
                    {destructive.map(renderAction)}
                  </ul>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

export const MessageActionHost = memo(MessageActionHostInner);
