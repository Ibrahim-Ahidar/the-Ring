// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { SafetyProvider } from "../context/safety-context";
import ar from "../messages/ar.json";
import { PrivacySettingsView } from "./PrivacySettingsView";

vi.mock("../actions", () => ({
  updatePrivacyAction: vi.fn(async () => ({ ok: true as const, value: {} })),
  fetchBlocksAction: vi.fn(),
  fetchMyReportsAction: vi.fn(),
  blockUserAction: vi.fn(),
  unblockUserAction: vi.fn(),
  reportUserAction: vi.fn(),
  reportMessageAction: vi.fn(),
}));

const privacy = {
  discoverable: true,
  profileVisibility: "public" as const,
  showLastSeen: true,
  showOnline: true,
  sendReadReceipts: true,
  whoCanMessage: "everyone" as const,
  whoCanAddToGroups: "everyone" as const,
};

describe("PrivacySettingsView", () => {
  it("renders Arabic controls with RTL direction", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={{ safety: ar }}>
        <SafetyProvider initialPrivacy={privacy} initialBlocks={[]} initialReports={[]}>
          <PrivacySettingsView />
        </SafetyProvider>
      </NextIntlClientProvider>,
    );

    const root = container.querySelector('[dir="rtl"]');
    expect(root).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: ar.pageTitle })).toBeTruthy();
    expect(screen.getByText(ar.settings.discoverable)).toBeTruthy();
  });
});
