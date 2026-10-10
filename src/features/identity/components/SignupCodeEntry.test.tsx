// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resendConfirmationAction, verifySignupCodeAction } from "../actions";
import { IdentityFormProvider } from "../context/identity-form-context";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { normalizeCode, SignupCodeEntry } from "./SignupCodeEntry";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  verifySignupCodeAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}));

const verify = vi.mocked(verifySignupCodeAction);
const resend = vi.mocked(resendConfirmationAction);

function renderEntry(
  props: Partial<Parameters<typeof SignupCodeEntry>[0]> = {},
  locale: "en" | "ar" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ identity: locale === "en" ? en : ar }}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <IdentityFormProvider>
          <SignupCodeEntry email="new@pulse.test" onBack={vi.fn()} {...props} />
        </IdentityFormProvider>
      </div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  verify.mockReset();
  resend.mockReset();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("normalizeCode", () => {
  it("keeps six ASCII digits and converts Arabic-Indic digits", () => {
    expect(normalizeCode("12 34-56 78")).toBe("123456");
    expect(normalizeCode("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeCode("۱۲۳۴۵۶")).toBe("123456");
  });
});

describe("SignupCodeEntry", () => {
  it("auto-submits a pasted code and lands in /app", async () => {
    verify.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderEntry();

    const input = screen.getByLabelText("6-digit code");
    await user.click(input);
    await user.paste("123 456");

    expect(verify).toHaveBeenCalledWith({ email: "new@pulse.test", token: "123456" });
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("auto-submits on the sixth typed digit", async () => {
    verify.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderEntry();

    await user.type(screen.getByLabelText("6-digit code"), "12345");
    expect(verify).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("6-digit code"), "6");
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("shows the wrong-or-expired message", async () => {
    verify.mockResolvedValue({ ok: false, error: { code: "identity.code_expired" } });
    const user = userEvent.setup();
    renderEntry();

    await user.type(screen.getByLabelText("6-digit code"), "000000");
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.errors.identity.code_expired,
    );
    expect(screen.getByLabelText("6-digit code").getAttribute("aria-invalid")).toBe("true");
  });

  it("asks for a new code after five wrong codes", async () => {
    verify.mockResolvedValue({ ok: false, error: { code: "identity.code_invalid" } });
    const user = userEvent.setup();
    renderEntry();

    const input = screen.getByLabelText("6-digit code");
    for (let i = 0; i < 5; i += 1) {
      await user.type(input, "111111");
    }
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.errors.identity.code_attempts_exhausted,
    );
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("enables resend after the 60 s cooldown", async () => {
    vi.useFakeTimers();
    resend.mockResolvedValue({ ok: true, value: undefined });
    renderEntry();

    const button = screen.getByRole("button", { name: "Send a new code in 60s" });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    const ready = screen.getByRole("button", { name: "Send a new code" });
    await act(async () => {
      fireEvent.click(ready);
    });
    expect(resend).toHaveBeenCalledWith("new@pulse.test");
    expect(screen.getByRole("status").textContent).toBe(en.codeResent);
    expect(screen.getByRole("button", { name: "Send a new code in 60s" })).toBeTruthy();
  });

  it("resends on mount when login sends an unconfirmed member here", async () => {
    resend.mockResolvedValue({ ok: true, value: undefined });
    renderEntry({ resendOnMount: true, intro: en.errors.identity.confirmation_required });

    expect(await screen.findByText(en.errors.identity.confirmation_required)).toBeTruthy();
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("keeps the code field and the email left-to-right in Arabic", () => {
    renderEntry({}, "ar");

    const input = screen.getByLabelText(ar.codeLabel);
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    const address = screen.getByText("new@pulse.test");
    expect(address.tagName).toBe("BDI");
    expect(address.getAttribute("dir")).toBe("ltr");
  });
});
