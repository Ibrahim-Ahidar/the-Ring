// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { formatLastActive } from "../session-display";
import type { DeviceSession } from "../types";
import { SecuritySettings } from "./SecuritySettings";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const actions = vi.hoisted(() => ({
  revokeSessionAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
  signOutAction: vi.fn(),
}));
vi.mock("../actions", () => actions);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const sessions: DeviceSession[] = [
  {
    id: "11111111-aaaa-4aaa-8aaa-000000000001",
    device_label: "Firefox on macOS",
    last_seen_at: minutesAgo(5),
    revoked_at: null,
    created_at: minutesAgo(600),
  },
  {
    id: "22222222-bbbb-4bbb-8bbb-000000000002",
    device_label: null,
    last_seen_at: minutesAgo(0),
    revoked_at: null,
    created_at: minutesAgo(900),
  },
  {
    id: "33333333-cccc-4ccc-8ccc-000000000003",
    device_label: "Safari on iPhone",
    last_seen_at: minutesAgo(180),
    revoked_at: null,
    created_at: minutesAgo(1200),
  },
];
const CURRENT = sessions[1]!.id;

function renderSettings(locale: "en" | "ar" = "en") {
  const messages = locale === "en" ? en : ar;
  return render(
    <div dir={locale === "ar" ? "rtl" : "ltr"}>
      <NextIntlClientProvider locale={locale} messages={{ identity: messages }}>
        <SecuritySettings sessions={sessions} currentDeviceId={CURRENT} />
      </NextIntlClientProvider>
    </div>,
  );
}

function rows() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  cleanup();
});

describe("SecuritySettings", () => {
  it("reads rows like 'Firefox on macOS · Last active 5 minutes ago' with no id fragments", () => {
    renderSettings();
    const firefox = rows().find((row) => row.textContent?.includes("Firefox on macOS"))!;
    expect(firefox.textContent).toContain("Last active 5 minutes ago");
    for (const row of rows()) {
      expect(row.textContent).not.toMatch(/[0-9a-f]{8}/);
    }
  });

  it("lists the current device first with a single 'This device' tag", () => {
    renderSettings();
    const [first, ...rest] = rows();
    expect(first!.getAttribute("data-session-id")).toBe(CURRENT);
    expect(within(first!).getAllByText("This device")).toHaveLength(1);
    expect(within(first!).getByText("Unknown device")).toBeTruthy();
    expect(within(first!).queryByRole("button")).toBeNull();
    for (const row of rest) {
      expect(within(row).queryByText("This device")).toBeNull();
    }
    expect(rest.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Firefox on macOS"),
      expect.stringContaining("Safari on iPhone"),
    ]);
  });

  it("revokes after confirmation, removes the row optimistically, and refreshes without reloading", async () => {
    let resolve!: (value: { ok: true; value: undefined }) => void;
    actions.revokeSessionAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderSettings();

    const safari = rows().find((row) => row.textContent?.includes("Safari on iPhone"))!;
    fireEvent.click(within(safari).getByRole("button", { name: "Revoke" }));
    expect(actions.revokeSessionAction).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Safari on iPhone");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));

    expect(actions.revokeSessionAction).toHaveBeenCalledWith(sessions[2]!.id);
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText("Safari on iPhone")).toBeNull();

    resolve({ ok: true, value: undefined });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });

  it("puts the row back and shows the error when a revoke fails", async () => {
    actions.revokeSessionAction.mockResolvedValue({
      ok: false,
      error: { code: "identity.not_found" },
    });
    renderSettings();
    const safari = rows().find((row) => row.textContent?.includes("Safari on iPhone"))!;
    fireEvent.click(within(safari).getByRole("button", { name: "Revoke" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out" }),
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(rows()).toHaveLength(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancelling the dialog keeps the device", () => {
    renderSettings();
    const safari = rows().find((row) => row.textContent?.includes("Safari on iPhone"))!;
    fireEvent.click(within(safari).getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(actions.revokeSessionAction).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it("signs out every other device without a full page reload", async () => {
    actions.revokeOtherSessionsAction.mockResolvedValue({ ok: true, value: 2 });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out" }),
    );

    expect(actions.revokeOtherSessionsAction).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.getAttribute("data-session-id")).toBe(CURRENT);
    expect(await screen.findByText("Signed out 2 devices.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign out other devices" })).toBeNull();
  });

  it("shows feedback when sign-out fails", async () => {
    actions.signOutAction.mockResolvedValue({
      ok: false,
      error: { code: "platform.unexpected" },
    });
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("renders in Arabic (RTL) with localised device sentences", () => {
    const { container } = renderSettings("ar");
    expect(container.firstElementChild!.getAttribute("dir")).toBe("rtl");
    // The localised sentence inherits RTL instead of being forced LTR by its Latin start.
    expect(screen.getByText("Firefox على macOS").getAttribute("dir")).toBeNull();
    expect(screen.getByText("جهاز غير معروف")).toBeTruthy();
    expect(screen.getByText("هذا الجهاز")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تسجيل الخروج من الأجهزة الأخرى" })).toBeTruthy();
  });
});

describe("formatLastActive", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("is relative within a week and a date after", () => {
    expect(formatLastActive("2026-10-10T11:59:30Z", "en", now)).toBeNull();
    expect(formatLastActive("2026-10-10T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(formatLastActive("2026-10-10T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(formatLastActive("2026-10-09T12:00:00Z", "en", now)).toBe("yesterday");
    expect(formatLastActive("2026-09-01T12:00:00Z", "en", now)).toBe("Sep 1, 2026");
  });
});
