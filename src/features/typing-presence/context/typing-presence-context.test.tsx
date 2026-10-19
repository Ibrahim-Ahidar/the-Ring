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
  const peer = {
    presence: null as null | ((state: Record<string, unknown[]>) => void),
  };
  return { handle, peer };
});
const peer = hub.peer;

vi.mock("@/platform/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
  }),
}));
vi.mock("@/platform/rpc", () => ({ asRpcClient: (client: unknown) => client }));
vi.mock("@/platform/realtime-hub", () => ({
  joinPeerPresence: () => ({
    onPresence: (cb: typeof peer.presence) => {
      peer.presence = cb;
      return () => undefined;
    },
    onStatus: () => () => undefined,
    leave: () => undefined,
  }),
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
    peer.presence = null;
  });
  afterEach(() => {
    cleanup();
    resetTypingStoreForTests();
    vi.useRealTimers();
  });

  it("does not track per conversation and does not re-render consumers on typing", async () => {
    await mount();
    expect(hub.handle.track).not.toHaveBeenCalled();
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

  it("derives online from the peer's private presence topic, gated by presence_allowed", async () => {
    await mount();
    expect(screen.getByTestId("online").textContent).toBe("false");
    await act(async () => {
      peer.presence?.({ ada: [{}] });
    });
    expect(screen.getByTestId("online").textContent).toBe("true");
    await act(async () => {
      peer.presence?.({});
    });
    expect(screen.getByTestId("online").textContent).toBe("false");
  });
});
