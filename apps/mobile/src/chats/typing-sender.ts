export const TYPING_THROTTLE_MS = 3000;
export const TYPING_IDLE_MS = 3000;

type Deps = {
  send: (event: "typing.started" | "typing.stopped") => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** Throttled "typing.started" while the draft changes; "typing.stopped" when it empties or goes idle. */
export function createTypingSender(deps: Deps) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let active = false;
  let lastSentAt = -Infinity;
  let idle: unknown = null;

  function stop() {
    if (idle !== null) {
      clearTimer(idle);
      idle = null;
    }
    if (active) {
      active = false;
      deps.send("typing.stopped");
    }
  }

  function input(text: string) {
    if (text.trim().length === 0) {
      stop();
      return;
    }
    const t = now();
    if (!active || t - lastSentAt >= TYPING_THROTTLE_MS) {
      active = true;
      lastSentAt = t;
      deps.send("typing.started");
    }
    if (idle !== null) clearTimer(idle);
    idle = setTimer(stop, TYPING_IDLE_MS);
  }

  return { input, stop };
}
