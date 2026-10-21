// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, useTimeZone } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { TimeZoneSync } from "./TimeZoneSync";

function Zone() {
  return <span data-testid="zone">{useTimeZone()}</span>;
}

function renderWithServerZone(serverZone: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{}} timeZone={serverZone}>
      <TimeZoneSync timeZone={serverZone}>
        <Zone />
      </TimeZoneSync>
    </NextIntlClientProvider>,
  );
}

function mockBrowserZone(zone: string) {
  const original = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
    const formatter = new original(...args);
    const resolved = formatter.resolvedOptions();
    formatter.resolvedOptions = () => ({ ...resolved, timeZone: zone });
    return formatter;
  }) as unknown as typeof Intl.DateTimeFormat);
}

describe("TimeZoneSync", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    refresh.mockClear();
    document.cookie = "pulse_tz=; max-age=0; path=/";
  });

  it("switches dates to the browser's zone after mount", async () => {
    mockBrowserZone("Asia/Tokyo");
    renderWithServerZone("UTC");
    await waitFor(() => expect(screen.getByTestId("zone").textContent).toBe("Asia/Tokyo"));
    expect(document.cookie).toContain("pulse_tz=Asia%2FTokyo");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the server zone when it already matches", () => {
    mockBrowserZone("Asia/Tokyo");
    renderWithServerZone("Asia/Tokyo");
    expect(screen.getByTestId("zone").textContent).toBe("Asia/Tokyo");
    expect(refresh).not.toHaveBeenCalled();
  });
});
