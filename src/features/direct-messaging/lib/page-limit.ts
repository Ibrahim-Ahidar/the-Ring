/** Cookie the client sets to its viewport height so the server can size a chat's first page. */
export const VIEWPORT_COOKIE = "ring-vh";

export const MIN_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 60;
export const DEFAULT_PAGE_LIMIT = 40;

const SCREENS = 3;
/** Average rendered height of one message row, in px. */
const AVG_ROW_HEIGHT = 64;

/** About three screens of rows, clamped to what list_messages accepts. */
export function computePageLimit(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_PAGE_LIMIT;
  }
  const rows = Math.ceil((SCREENS * viewportHeight) / AVG_ROW_HEIGHT);
  return Math.min(MAX_PAGE_LIMIT, Math.max(MIN_PAGE_LIMIT, rows));
}

export function pageLimitFromCookie(value: string | undefined): number {
  return computePageLimit(Number(value));
}
