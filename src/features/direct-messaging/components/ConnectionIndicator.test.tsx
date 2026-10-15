// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionIndicator } from "@/features/direct-messaging/components/ConnectionIndicator";

import en from "../messages/en.json";

function view(status: Parameters<typeof ConnectionIndicator>[0]["status"]) {
  const tree = (s: typeof status) => (
    <NextIntlClientProvider locale="en" messages={{ "direct-messaging": en }}>
      <ConnectionIndicator status={s} />
    </NextIntlClientProvider>
  );
  const result = render(tree(status));
  return { ...result, update: (s: typeof status) => result.rerender(tree(s)) };
}

describe("ConnectionIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing while connected", () => {
    const { container } = view("connected");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.firstChild).toBeNull();
  });

  it("shows Connecting… only after the grace period", () => {
    view("reconnecting");
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status").textContent).toBe("Connecting…");
  });

  it("shows the network label offline and hides when connected", () => {
    const { update } = view("offline");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("status").textContent).toBe("Waiting for network…");
    act(() => update("connected"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
