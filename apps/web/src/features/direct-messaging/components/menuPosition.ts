export type AnchorRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};
export type Size = { width: number; height: number };

export const MENU_MARGIN = 8;
const GAP = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Places a fixed menu panel relative to an anchor: below and aligned to the
 * inline-end edge by default, flipped above when it does not fit below, and
 * clamped to the viewport with an 8px margin.
 */
export function computeMenuPosition(
  anchor: AnchorRect,
  panel: Size,
  viewport: Size,
  dir: "ltr" | "rtl",
): { top: number; left: number; placement: "below" | "above" } {
  const fitsBelow =
    anchor.bottom + GAP + panel.height + MENU_MARGIN <= viewport.height;
  const fitsAbove = anchor.top - GAP - panel.height >= MENU_MARGIN;
  const placement = fitsBelow || !fitsAbove ? "below" : "above";
  const rawTop =
    placement === "below"
      ? anchor.bottom + GAP
      : anchor.top - GAP - panel.height;
  const rawLeft = dir === "rtl" ? anchor.left : anchor.right - panel.width;
  return {
    top: clamp(
      rawTop,
      MENU_MARGIN,
      viewport.height - panel.height - MENU_MARGIN,
    ),
    left: clamp(
      rawLeft,
      MENU_MARGIN,
      viewport.width - panel.width - MENU_MARGIN,
    ),
    placement,
  };
}
