import { useEffect, type RefObject } from "react";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Opens a menu from a touch long-press, right-click, ContextMenu key or
 * Shift+F10 on `target`. Long-press is cancelled by movement or scroll, and
 * the native context menu and the click that follows a long-press are
 * suppressed.
 */
export function useBubbleContextMenu(
  targetRef: RefObject<HTMLElement | null>,
  onOpen: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let origin: { x: number; y: number } | null = null;
    let suppressClick = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      origin = null;
    };
    const inMenu = (el: EventTarget | null) =>
      el instanceof Element && Boolean(el.closest("[data-bubble-menu]"));

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || inMenu(event.target)) {
        return;
      }
      clear();
      suppressClick = false;
      origin = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        timer = null;
        suppressClick = true;
        onOpen();
      }, LONG_PRESS_MS);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!origin) {
        return;
      }
      if (
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
        MOVE_TOLERANCE_PX
      ) {
        clear();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (inMenu(event.target)) {
        return;
      }
      event.preventDefault();
      if (!timer && !suppressClick) {
        onOpen();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (inMenu(event.target)) {
        return;
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        onOpen();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", clear);
    target.addEventListener("pointercancel", clear);
    target.addEventListener("pointerleave", clear);
    target.addEventListener("contextmenu", onContextMenu);
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("click", onClick, true);
    window.addEventListener("scroll", clear, true);
    return () => {
      clear();
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", clear);
      target.removeEventListener("pointercancel", clear);
      target.removeEventListener("pointerleave", clear);
      target.removeEventListener("contextmenu", onContextMenu);
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", clear, true);
    };
  }, [targetRef, onOpen, enabled]);
}
