/**
 * Development-only timing hooks (issue #215). Every function is a no-op unless
 * `__DEV__` is true; Metro folds `__DEV__` to false in release bundles, so the
 * require() below is dead code there. Output: `[pulse-timing]` console lines.
 */
type Runtime = typeof import("./runtime");

function load(): Runtime | null {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./runtime") as Runtime;
  }
  return null;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function timingTapStart(key: string): void {
  if (__DEV__) load()?.tapStart(key, now());
}
export function timingBubbleShown(key: string): void {
  if (__DEV__) load()?.bubbleShown(key, now());
}
export function timingArrival(createdAt: string): void {
  if (__DEV__) load()?.arrival(createdAt, Date.now());
}
export function timingChatOpenStart(conversationId: string): void {
  if (__DEV__) load()?.chatOpenStart(conversationId, now());
}
export function timingChatOpenPainted(conversationId: string): void {
  if (__DEV__) load()?.chatOpenPainted(conversationId, now());
}
export function timingColdStartPainted(): void {
  if (__DEV__) load()?.coldStartPainted(now());
}
