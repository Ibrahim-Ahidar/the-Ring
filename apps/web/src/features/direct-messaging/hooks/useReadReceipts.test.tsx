// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { createRef, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineMessage } from "@pulse/core/timeline";

const markSeenUpTo = vi.fn(async () => true);
const viewer: { id: string | null } = { id: "me" };

vi.mock("../context/MessagingProvider", () => ({
  useMarkSeenUpTo: () => markSeenUpTo,
  useViewerId: () => viewer.id,
}));

import { useReadTracker } from "./useReadReceipts";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observers: { cb: Callback; targets: Element[] }[] = [];

class FakeObserver {
  entry: { cb: Callback; targets: Element[] };
  constructor(cb: Callback) {
    this.entry = { cb, targets: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  unobserve() {}
  disconnect() {}
}

function msg(n: number, sender = "peer", deleted: string | null = null) {
  return {
    id: `m${String(n).padStart(2, "0")}`,
    conversation_id: "c1",
    sender_id: sender,
    created_at: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
    deleted_at: deleted,
  } as TimelineMessage;
}

function Harness({ messages }: { messages: TimelineMessage[] }) {
  const rootRef = createRef<HTMLDivElement>();
  const track = useReadTracker("c1", rootRef);
  useEffect(() => {}, []);
  return (
    <div ref={rootRef}>
      {messages.map((m) => (
        <div key={m.id} ref={track(m)} data-id={m.id} />
      ))}
    </div>
  );
}

function intersect(ids: string[]) {
  const obs = observers[0];
  act(() => {
    obs.cb(
      obs.targets
        .filter((t) => ids.includes((t as HTMLElement).dataset.id ?? ""))
        .map((target) => ({ target, isIntersecting: true })),
    );
  });
}

function setActive(visible: boolean, focused: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (visible ? "visible" : "hidden"),
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
}

describe("useReadTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    markSeenUpTo.mockClear();
    viewer.id = "me";
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    setActive(true, true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends one markRead with the newest of ten visible messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(i + 1));
    render(<Harness messages={messages} />);
    intersect(messages.map((m) => m.id));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).toHaveBeenCalledTimes(1);
    expect(markSeenUpTo).toHaveBeenCalledWith("c1", messages[9]);
  });

  it("sends nothing when the tab is hidden or unfocused", () => {
    const messages = [msg(1), msg(2)];
    setActive(false, true);
    render(<Harness messages={messages} />);
    intersect(["m01", "m02"]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    setActive(true, false);
    intersect(["m01", "m02"]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(markSeenUpTo).not.toHaveBeenCalled();
  });

  it("ignores own and deleted messages", () => {
    const messages = [msg(1, "me"), msg(2, "peer", "2026-01-02T00:00:00Z")];
    render(<Harness messages={messages} />);
    intersect(["m01", "m02"]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(markSeenUpTo).not.toHaveBeenCalled();
  });

  it("never sends something older than what was already sent", () => {
    const messages = [msg(1), msg(2), msg(3)];
    render(<Harness messages={messages} />);
    intersect(["m03"]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).toHaveBeenCalledTimes(1);
    intersect(["m01", "m02"]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).toHaveBeenCalledTimes(1);
  });

  it("marks group messages from any other member read", () => {
    const messages = [msg(1, "alice"), msg(2, "bob")];
    render(<Harness messages={messages} />);
    intersect(["m01", "m02"]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).toHaveBeenCalledWith("c1", messages[1]);
  });

  it("rechecks visible rows once the viewer id becomes known", () => {
    viewer.id = null;
    const messages = [msg(1, "peer")];
    const view = render(<Harness messages={messages} />);
    intersect(["m01"]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).not.toHaveBeenCalled();
    viewer.id = "me";
    view.rerender(<Harness messages={messages} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(markSeenUpTo).toHaveBeenCalledWith("c1", messages[0]);
  });
});
