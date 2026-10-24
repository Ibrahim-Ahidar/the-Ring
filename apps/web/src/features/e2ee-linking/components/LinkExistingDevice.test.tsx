// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

const parseLinkQr = vi.fn((_text: string) => null);
vi.mock("@pulse/core", () => ({ callRpc: vi.fn() }));
vi.mock("@pulse/core/linking", () => ({
  linkTopic: vi.fn(),
  parseLinkQr: (text: string) => parseLinkQr(text),
  runExistingDeviceLink: vi.fn(),
}));
vi.mock("@pulse/core/rpc", () => ({ asRpcClient: vi.fn() }));
vi.mock("@/platform/crypto/account-key", () => ({ openAccountKeyStore: vi.fn() }));
vi.mock("@/platform/local-store", () => ({ getLocalStore: vi.fn() }));
vi.mock("@/platform/supabase/browser", () => ({ createSupabaseBrowserClient: vi.fn() }));
vi.mock("../broadcast-transport", () => ({ openLinkTransport: vi.fn() }));

let mode: "decode" | "denied" = "decode";
vi.mock("../scanner/QrScanner", async () => {
  const { useEffect } = await import("react");
  return {
    QrScanner: ({
      onDecode,
      onFailure,
    }: {
      onDecode: (t: string) => void;
      onFailure: (r: string) => void;
    }) => {
      useEffect(() => {
        if (mode === "decode") onDecode("scanned-qr-text");
        else onFailure("denied");
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="scanner" />;
    },
  };
});

import { LinkExistingDevice } from "./LinkExistingDevice";

afterEach(() => {
  cleanup();
  parseLinkQr.mockClear();
});

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ "e2ee-linking": en }}>
      <LinkExistingDevice />
    </NextIntlClientProvider>
  );
}

describe("LinkExistingDevice camera scan", () => {
  it("feeds the decoded text to the same parser as pasted text", async () => {
    mode = "decode";
    render(ui());
    await userEvent.click(screen.getByRole("button", { name: en.scan }));
    await waitFor(() => expect(parseLinkQr).toHaveBeenCalledWith("scanned-qr-text"));
    expect(await screen.findByText(en.errorInvalid)).toBeTruthy();

    parseLinkQr.mockClear();
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "pasted-text");
    await userEvent.click(screen.getByRole("button", { name: en.connect }));
    expect(parseLinkQr).toHaveBeenCalledWith("pasted-text");
  });

  it("shows the paste fallback message when the camera is denied", async () => {
    mode = "denied";
    render(ui());
    await userEvent.click(screen.getByRole("button", { name: en.scan }));
    expect(await screen.findByText(en.scanDenied)).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
