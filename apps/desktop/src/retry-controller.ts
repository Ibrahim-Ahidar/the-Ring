import { nextRetryDelay } from "./offline";

export interface RetryDeps {
  probe: () => Promise<boolean>;
  onOnline: () => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export function createRetryController(deps: RetryDeps) {
  let attempt = 0;
  let handle: unknown = null;
  let active = false;

  const clear = () => {
    if (handle !== null) deps.clearTimer(handle);
    handle = null;
  };
  const schedule = () => {
    clear();
    handle = deps.setTimer(() => void tick(), nextRetryDelay(attempt++));
  };
  async function tick(): Promise<void> {
    handle = null;
    if (!active) return;
    let ok = false;
    try {
      ok = await deps.probe();
    } catch {
      ok = false;
    }
    if (!active) return;
    if (ok) {
      active = false;
      deps.onOnline();
    } else schedule();
  }

  return {
    /** Begin retrying with backoff from the first delay. */
    start(): void {
      active = true;
      attempt = 0;
      schedule();
    },
    /** Probe now (button, focus, online event) and keep the backoff going. */
    async retryNow(): Promise<void> {
      if (!active) return;
      clear();
      await tick();
    },
    stop(): void {
      active = false;
      clear();
    },
  };
}
