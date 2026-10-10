// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";
import { NewChatClient } from "./NewChatClient";

const openDirectAction = vi.fn();
const push = vi.fn();
let query = "";

vi.mock("../actions", () => ({
  openDirectAction: (...args: unknown[]) => openDirectAction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/shell/slots", () => ({ getContributions: () => [] }));

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "direct-messaging": en }}>
      <NewChatClient />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  query = "";
});

describe("NewChatClient", () => {
  it("never shows a raw error code for unknown codes", async () => {
    openDirectAction.mockResolvedValue({
      ok: false,
      error: { code: "some.unknown_code" },
    });
    setup();
    fireEvent.change(screen.getByLabelText(en.usernameLabel), { target: { value: "bob" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: en.openChat }));
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(en.errors.platform.unexpected);
    expect(document.body.textContent).not.toContain("some.unknown_code");
  });

  it("translates known codes such as rate limiting", async () => {
    openDirectAction.mockResolvedValue({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
    setup();
    fireEvent.change(screen.getByLabelText(en.usernameLabel), { target: { value: "bob" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: en.openChat }));
    });
    expect(screen.getByRole("alert").textContent).toBe(en.errors.platform.rate_limited);
  });

  it("ignores a second submit while the first is pending", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    openDirectAction.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    fireEvent.change(screen.getByLabelText(en.usernameLabel), { target: { value: "bob" } });
    const form = screen.getByLabelText(en.usernameLabel).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(openDirectAction).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(en.opening);
    await act(async () => {
      resolve({ ok: true, value: { conversationId: "c1" } });
    });
    expect(push).toHaveBeenCalledWith("/app/chats/c1");
  });

  it("shows a loading state while auto-opening from ?username=", async () => {
    query = "username=bob";
    openDirectAction.mockReturnValue(new Promise(() => undefined));
    setup();
    expect(screen.getByRole("status").textContent).toBe(en.opening);
    expect(openDirectAction).toHaveBeenCalledTimes(1);
  });
});
