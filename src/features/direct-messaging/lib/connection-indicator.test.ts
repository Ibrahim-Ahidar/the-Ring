import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConnectionIndicator,
  type ConnectionIndicatorOutput,
} from "./connection-indicator";

function setup() {
  const seen: ConnectionIndicatorOutput[] = [];
  const indicator = createConnectionIndicator({
    onChange: (output) => seen.push(output),
  });
  return { seen, indicator };
}

describe("createConnectionIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing before the grace period and connecting after it", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    vi.advanceTimersByTime(2999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["connecting"]);
  });

  it("treats disconnected like reconnecting", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("disconnected");
    vi.advanceTimersByTime(3000);
    expect(seen).toEqual(["connecting"]);
  });

  it("uses the network label when offline", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("offline");
    vi.advanceTimersByTime(3000);
    expect(seen).toEqual(["waitingForNetwork"]);
  });

  it("clears immediately when connected", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    vi.advanceTimersByTime(3000);
    indicator.setStatus("connected");
    expect(seen).toEqual(["connecting", "none"]);
  });

  it("never shows when connected again inside the grace period", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    vi.advanceTimersByTime(2000);
    indicator.setStatus("connected");
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([]);
  });

  it("ignores hidden time and restarts the grace when visible again", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    vi.advanceTimersByTime(2000);
    indicator.setVisible(false);
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual([]);
    indicator.setVisible(true);
    vi.advanceTimersByTime(2999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["connecting"]);
  });

  it("switches the label without waiting again", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    vi.advanceTimersByTime(3000);
    indicator.setStatus("offline");
    expect(seen).toEqual(["connecting", "waitingForNetwork"]);
  });

  it("dispose cancels a pending timer", () => {
    const { seen, indicator } = setup();
    indicator.setStatus("reconnecting");
    indicator.dispose();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([]);
  });
});
