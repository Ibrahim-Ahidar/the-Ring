import { useEffect, type RefObject } from "react";

import { createLongPress } from "./useLongPress";

const inMenu = (el: EventTarget | null) =>
  el instanceof Element && Boolean(el.closest("[data-bubble-menu]"));

/**
 * Opens a menu from a touch long-press, right-click, ContextMenu key or
 * Shift+F10 on `target`, using the shared long-press core. Also cancels on
 * scroll, and marks the target `data-pressing` while a press is pending so
 * the bubble can disable text selection only for that gesture.
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
    const core = createLongPress<void>(onOpen, (pressing) => {
      if (pressing) {
        target.setAttribute("data-pressing", "true");
      } else {
        target.removeAttribute("data-pressing");
      }
    });
    const guard =
      <E extends Event>(handler: (event: E) => void) =>
      (event: E) => {
        if (!inMenu(event.target)) {
          handler(event);
        }
      };

    const onPointerDown = guard((e: PointerEvent) => core.pointerDown(undefined, e));
    const onPointerMove = (e: PointerEvent) => core.pointerMove(e);
    const onContextMenu = guard((e: MouseEvent) => core.contextMenu(undefined, e));
    const onKeyDown = guard((e: KeyboardEvent) => core.keyDown(undefined, e));
    const onClick = (e: MouseEvent) => core.click(e);

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", core.clear);
    target.addEventListener("pointercancel", core.clear);
    target.addEventListener("pointerleave", core.clear);
    target.addEventListener("contextmenu", onContextMenu);
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("click", onClick, true);
    window.addEventListener("scroll", core.clear, true);
    return () => {
      core.clear();
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", core.clear);
      target.removeEventListener("pointercancel", core.clear);
      target.removeEventListener("pointerleave", core.clear);
      target.removeEventListener("contextmenu", onContextMenu);
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", core.clear, true);
    };
  }, [targetRef, onOpen, enabled]);
}
