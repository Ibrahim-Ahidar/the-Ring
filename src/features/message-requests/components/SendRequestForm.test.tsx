// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";
import { SendRequestForm } from "./SendRequestForm";

const createRequestAction = vi.fn();

vi.mock("../actions", () => ({
  createRequestAction: (...args: unknown[]) => createRequestAction(...args),
}));

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "message-requests": en }}>
      <SendRequestForm username="ada" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SendRequestForm", () => {
  it("sends the note and confirms", async () => {
    createRequestAction.mockResolvedValue({ ok: true, value: { id: "r1" } });
    setup();
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect((await screen.findByRole("status")).textContent).toContain("Request sent to @ada.");
    expect(createRequestAction).toHaveBeenCalledWith({ username: "ada", note: "hi" });
  });

  it("shows a translated error", async () => {
    createRequestAction.mockResolvedValue({
      ok: false,
      error: { code: "message_requests.not_allowed" },
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect((await screen.findByRole("alert")).textContent).toContain("send a message request");
  });
});
