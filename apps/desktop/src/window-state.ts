export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximised: boolean;
}

export const DEFAULT_STATE: WindowState = { width: 1100, height: 760, maximised: false };
const MIN_W = 400;
const MIN_H = 300;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Parse and validate saved JSON; fall back to defaults on anything wrong. */
export function parseWindowState(raw: string | null | undefined): WindowState {
  if (!raw) return { ...DEFAULT_STATE };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_STATE };
  }
  if (!data || typeof data !== "object") return { ...DEFAULT_STATE };
  const d = data as Record<string, unknown>;
  const width = isNum(d.width) && d.width >= MIN_W ? Math.round(d.width) : DEFAULT_STATE.width;
  const height = isNum(d.height) && d.height >= MIN_H ? Math.round(d.height) : DEFAULT_STATE.height;
  const state: WindowState = { width, height, maximised: d.maximised === true };
  if (isNum(d.x) && isNum(d.y)) {
    state.x = Math.round(d.x);
    state.y = Math.round(d.y);
  }
  return state;
}

export function serializeWindowState(state: WindowState): string {
  return JSON.stringify(state);
}

/** True if the window overlaps some display enough for the user to grab it. */
export function isVisibleOnSomeDisplay(state: WindowState, displays: Rect[]): boolean {
  if (state.x === undefined || state.y === undefined) return false;
  const x = state.x;
  const y = state.y;
  return displays.some((d) => {
    const overlapW = Math.min(x + state.width, d.x + d.width) - Math.max(x, d.x);
    const overlapH = Math.min(y + state.height, d.y + d.height) - Math.max(y, d.y);
    return overlapW >= 100 && overlapH >= 50;
  });
}

/** Drop the saved position when it is off every display, keeping size. */
export function sanitizeForDisplays(state: WindowState, displays: Rect[]): WindowState {
  if (state.x === undefined || state.y === undefined) return state;
  if (isVisibleOnSomeDisplay(state, displays)) return state;
  return { width: state.width, height: state.height, maximised: state.maximised };
}
