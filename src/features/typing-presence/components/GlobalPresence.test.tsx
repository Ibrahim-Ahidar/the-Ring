// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hub = vi.hoisted(() => ({
  presence: null as null | ((state: Record<string, unknown[]>) => void),
  status: null as null | ((status: string) => void),
  track: vi.fn(async () => undefined),
  untrack: vi.fn(async () => undefined),
  leave: vi.fn(),
}));

vi.mock("@/platform/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
  }),
}));
vi.mock("@/platform/rpc", () => ({ asRpcClient: (client: unknown) => client }));
vi.mock("@/platform/realtime-hub", () => ({
  joinOwnPresence: () => ({
    onPresence: (cb: typeof hub.presence) => {
      hub.presence = cb;
      return () => undefined;
    },
    onStatus: (cb: typeof hub.status) => {
      hub.status = cb;
      return () => undefined;
    },
    track: hub.track,
    untrack: hub.untrack,
    leave: hub.leave,
  }),
}));
vi.mock("@/features/typing-presence/service", () => ({
  touchLastSeenForMember: vi.fn(async () => undefined),
}));

import { GlobalPresence } from "@/features/typing-presence/components/GlobalPresence";
async function mount() {
  render(<GlobalPresence />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    hub.status?.("SUBSCRIBED");
  });
}

describe("GlobalPresence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    hub.track.mockClear();
    hub.untrack.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("tracks once on SUBSCRIBED", async () => {
    await mount();
    expect(hub.track).toHaveBeenCalledTimes(1);
  });

  it("untracks on pagehide", async () => {
    await mount();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(hub.untrack).toHaveBeenCalledTimes(1);
  });

  it("untracks after 30 s hidden, and cancels when visible again", async () => {
    await mount();
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };

    act(() => setVisibility("hidden"));
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(hub.untrack).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hub.untrack).not.toHaveBeenCalled();

    act(() => setVisibility("hidden"));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(hub.untrack).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    expect(hub.track).toHaveBeenCalledTimes(2);
  });
});
