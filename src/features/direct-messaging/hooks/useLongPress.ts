"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

export const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

type PointLike = { pointerType: string; clientX: number; clientY: number };
type Cancelable = { preventDefault: () => void; stopPropagation: () => void };
type KeyLike = { key: string; shiftKey: boolean; preventDefault: () => void };

/**
 * The long-press / context-menu state machine shared by chat rows and message
 * bubbles: a 500 ms touch press cancelled by movement, scroll or leaving;
 * right-click, the ContextMenu key and Shift+F10; and swallowing the click
 * that follows a fired long-press. Event-system agnostic, so React props and
 * native listeners can both drive it.
 */
export function createLongPress<T>(
  onTrigger: (item: T) => void,
  onPressingChange?: (pressing: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: { x: number; y: number } | null = null;
  let suppressClick = false;

  const clear = () => {
    const wasPressing = timer !== null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    origin = null;
    if (wasPressing) {
      onPressingChange?.(false);
    }
  };

  return {
    clear,
    pointerDown(item: T, event: PointLike) {
      if (event.pointerType === "mouse") {
        return;
      }
      clear();
      suppressClick = false;
      origin = { x: event.clientX, y: event.clientY };
      onPressingChange?.(true);
      timer = setTimeout(() => {
        timer = null;
        origin = null;
        suppressClick = true;
        onPressingChange?.(false);
        onTrigger(item);
      }, LONG_PRESS_MS);
    },
    pointerMove(event: PointLike) {
      if (
        origin &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE_PX
      ) {
        clear();
      }
    },
    contextMenu(item: T, event: Pick<Cancelable, "preventDefault">) {
      event.preventDefault();
      // Some touch browsers fire contextmenu around the long-press itself.
      if (!timer && !suppressClick) {
        onTrigger(item);
      }
    },
    keyDown(item: T, event: KeyLike) {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        onTrigger(item);
      }
    },
    click(event: Cancelable) {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}

/**
 * Long-press / context-menu trigger for list rows. `bind(item)` returns the
 * React handlers for one element.
 */
export function useLongPress<T>(onTrigger: (item: T) => void) {
  const trigger = useRef(onTrigger);
  useLayoutEffect(() => {
    trigger.current = onTrigger;
  });
  const core = useMemo(() => createLongPress<T>((item) => trigger.current(item)), []);
  useLayoutEffect(() => core.clear, [core]);

  return useCallback(
    (item: T) => ({
      onPointerDown: (event: React.PointerEvent) => core.pointerDown(item, event),
      onPointerMove: (event: React.PointerEvent) => core.pointerMove(event),
      onPointerUp: core.clear,
      onPointerLeave: core.clear,
      onPointerCancel: core.clear,
      onContextMenu: (event: React.MouseEvent) => core.contextMenu(item, event),
      onKeyDown: (event: React.KeyboardEvent) => core.keyDown(item, event),
      onClick: (event: React.MouseEvent) => core.click(event),
    }),
    [core],
  );
}
