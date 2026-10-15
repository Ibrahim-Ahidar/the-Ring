// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTyping, resetTypingStoreForTests } from "@/platform/typing-store";

const hub = vi.hoisted(() => {
  const handle = {
    broadcast: null as null | ((event: string, payload: Record<string, unknown>) => void),
    presence: null as null | ((state: Record<string, unknown[]>) => void),
    status: null as null | ((status: string) => void),
    track: vi.fn(async () => undefined),
    untrack: vi.fn(async () => undefined),
    leave: vi.fn(),
    send: vi.fn(async () => undefined),
  };
  return { handle };
});

vi.mock("@/platform/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
  }),
}));
vi.mock("@/platform/rpc", () => ({ asRpcClient: (client: unknown) => client }));
vi.mock("@/platform/realtime-hub", () => ({
  joinConversation: () => ({
    onChange: () => () => undefined,
    onBroadcast: (cb: typeof hub.handle.broadcast) => {
      hub.handle.broadcast = cb;
      return () => undefined;
    },
    onPresence: (cb: typeof hub.handle.presence) => {
      hub.handle.presence = cb;
      return () => undefined;
    },
    onStatus: (cb: typeof hub.handle.status) => {
      hub.handle.status = cb;
      return () => undefined;
    },
    track: hub.handle.track,
    untrack: hub.handle.untrack,
    leave: hub.handle.leave,
    send: hub.handle.send,
  }),
}));
vi.mock("@/features/typing-presence/service", () => ({
  fetchSubjectPresence: vi.fn(async () => ({
    ok: true,
    value: {
      display_name: "Ada",
      last_seen_at: null,
      presence_allowed: true,
      show_last_seen: true,
      last_seen_visible: true,
    },
  })),
  touchLastSeenForMember: vi.fn(async () => undefined),
}));

import {
  TypingPresenceProvider,
  useTypingPresence,
} from "@/features/typing-presence/context/typing-presence-context";

let renders = 0;
function Probe() {
  const value = useTypingPresence();
  renders += 1;
  return <span data-testid="online">{String(value.subjectOnline)}</span>;
}

async function mount() {
  render(
    <TypingPresenceProvider conversationId="c1" otherUserId="ada">
      <Probe />
    </TypingPresenceProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    hub.handle.status?.("SUBSCRIBED");
  });
}

describe("TypingPresenceProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    renders = 0;
    hub.handle.track.mockClear();
    hub.handle.untrack.mockClear();
    resetTypingStoreForTests();
  });
  afterEach(() => {
    cleanup();
    resetTypingStoreForTests();
    vi.useRealTimers();
  });

  it("tracks on SUBSCRIBED and does not re-render consumers on typing", async () => {
    await mount();
    expect(hub.handle.track).toHaveBeenCalledTimes(1);
    const before = renders;
    await act(async () => {
      hub.handle.broadcast?.("typing.started", { userId: "ada" });
    });
    expect(getTyping("c1", "me")).toHaveLength(1);
    expect(renders).toBe(before);
  });

  it("ignores the viewer's own typing broadcasts", async () => {
    await mount();
    await act(async () => {
      hub.handle.broadcast?.("typing.started", { userId: "me" });
    });
    expect(getTyping("c1", "me")).toHaveLength(0);
  });

  it("untracks on pagehide", async () => {
    await mount();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(hub.handle.untrack).toHaveBeenCalledTimes(1);
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
    expect(hub.handle.untrack).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hub.handle.untrack).not.toHaveBeenCalled();

    act(() => setVisibility("hidden"));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(hub.handle.untrack).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    expect(hub.handle.track).toHaveBeenCalledTimes(2);
  });

  it("clears the online set when the channel leaves SUBSCRIBED", async () => {
    await mount();
    await act(async () => {
      hub.handle.presence?.({ ada: [{}] });
    });
    expect(screen.getByTestId("online").textContent).toBe("true");

    await act(async () => {
      hub.handle.status?.("CHANNEL_ERROR");
    });
    expect(screen.getByTestId("online").textContent).toBe("false");

    // presence callbacks are ignored while not subscribed
    await act(async () => {
      hub.handle.presence?.({ ada: [{}] });
    });
    expect(screen.getByTestId("online").textContent).toBe("false");
  });
});
