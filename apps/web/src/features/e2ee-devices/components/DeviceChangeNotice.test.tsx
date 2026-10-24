// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevicesChangedPayload } from "../devices-changed";

const OTHER = "11111111-aaaa-bbbb-cccc-000000000000";
const ME = "99999999-aaaa-bbbb-cccc-000000000000";

let listener: ((p: DevicesChangedPayload) => void) | null = null;
let subscribedTo: string | null | undefined;
let version = 1;

vi.mock("@pulse/core", async (orig) => ({
  ...(await orig<typeof import("@pulse/core")>()),
  isE2eeEnabled: () => true,
}));
vi.mock("../hooks/use-devices-session", () => ({
  useDevicesSession: () => ({ supabase: {}, rpc: {}, userId: ME }),
}));
vi.mock("../hooks/use-devices-topic", () => ({
  useDevicesTopic: (_s: unknown, userId: string | null, cb: (p: DevicesChangedPayload) => void) => {
    subscribedTo = userId;
    listener = cb;
  },
}));
vi.mock("../service", () => ({
  accountKeyVersions: async () => ({ ok: true, value: [{ user_id: OTHER, version }] }),
}));

import { DeviceChangeNotice } from "./DeviceChangeNotice";

const messages = {
  "e2ee-devices": {
    noticeNewDevice: "{name} added a device",
    noticeSecurityCode: "{name} security code changed",
    dismiss: "Dismiss",
  },
};

function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeviceChangeNotice otherUserId={OTHER} />
    </NextIntlClientProvider>,
  );
}

const event = (userId: string, kind: DevicesChangedPayload["kind"]): DevicesChangedPayload => ({
  userId,
  kind,
  origin: "",
  at: 1,
});

beforeEach(() => {
  listener = null;
  subscribedTo = undefined;
  version = 1;
});
afterEach(cleanup);

describe("DeviceChangeNotice (contact events sent by the server)", () => {
  it("listens on our own topic, not the contact's", async () => {
    mount();
    await act(async () => undefined);
    expect(subscribedTo).toBe(ME);
  });

  it("shows a notice when the contact's device list changed", async () => {
    mount();
    await act(async () => undefined);
    version = 1;
    await act(async () => listener?.(event(OTHER, "device_changed")));
    expect((await screen.findByRole("status")).textContent).toContain("11111111 added a device");
  });

  it("shows the security code notice when the key version went up", async () => {
    mount();
    await act(async () => undefined);
    version = 2;
    await act(async () => listener?.(event(OTHER, "security_code_changed")));
    expect((await screen.findByRole("status")).textContent).toContain("security code changed");
  });

  it("ignores events about other people", async () => {
    mount();
    await act(async () => undefined);
    await act(async () => listener?.(event("22222222-aaaa-bbbb-cccc-000000000000", "device_changed")));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
