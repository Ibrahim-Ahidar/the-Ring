"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";

const LAST_RELOAD_KEY = "pulse:stale-build-reload";
/** Never reload more than once in this window, so a real server fault can't loop. */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reloads the page once when the server no longer knows a Server Action the
 * page calls. That happens when the tab is older than the running build (a
 * new deployment, or a restarted dev server): every action then fails with
 * UnrecognizedActionError until the page loads the current JavaScript.
 */
export function shouldReloadForStaleBuild(
  error: unknown,
  now: number,
  lastReload: number | null,
): boolean {
  if (!unstable_isUnrecognizedActionError(error)) {
    return false;
  }
  return lastReload === null || now - lastReload > RELOAD_COOLDOWN_MS;
}

function readLastReload(): number | null {
  try {
    const value = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function StaleBuildReload() {
  useEffect(() => {
    const handle = (error: unknown, event: Event) => {
      const now = Date.now();
      if (!shouldReloadForStaleBuild(error, now, readLastReload())) {
        return;
      }
      event.preventDefault();
      try {
        sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
      } catch {
        // Storage can be blocked; the reload still helps.
      }
      window.location.reload();
    };
    const onRejection = (event: PromiseRejectionEvent) => handle(event.reason, event);
    const onError = (event: ErrorEvent) => handle(event.error, event);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
