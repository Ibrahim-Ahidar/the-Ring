"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

export const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press / context-menu trigger shared by list rows. `bind(item)` returns
 * handlers for one element: a 500 ms touch press (cancelled by movement,
 * pointer cancel i.e. scrolling, or leaving), right-click, the ContextMenu key
 * and Shift+F10. A fired long-press swallows the click that would follow, so
 * the link underneath is not followed.
 */
export function useLongPress<T>(onTrigger: (item: T) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const trigger = useRef(onTrigger);
  trigger.current = onTrigger;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const bind = useCallback(
    (item: T) => ({
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "mouse") {
          return;
        }
        clear();
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          suppressClick.current = true;
          trigger.current(item);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: PointerEvent) => {
        const start = origin.current;
        if (
          start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX
        ) {
          clear();
        }
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        clear();
        trigger.current(item);
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          trigger.current(item);
        }
      },
      onClick: (event: { preventDefault: () => void }) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
        }
      },
    }),
    [clear],
  );

  return bind;
}
