// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestPasswordResetAction,
  updatePasswordAction,
  verifyRecoveryCodeAction,
} from "../actions";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { PASSWORD_UPDATED_FLAG, PasswordUpdatedToast } from "./PasswordUpdatedToast";
import { ResetPasswordForm } from "./ResetPasswordForm";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  requestPasswordResetAction: vi.fn(),
  verifyRecoveryCodeAction: vi.fn(),
  updatePasswordAction: vi.fn(),
}));

const requestReset = vi.mocked(requestPasswordResetAction);
const verifyCode = vi.mocked(verifyRecoveryCodeAction);
const updatePassword = vi.mocked(updatePasswordAction);

function renderWith(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ identity: locale === "en" ? en : ar }}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>{node}</div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  requestReset.mockReset();
  verifyCode.mockReset();
  updatePassword.mockReset();
  push.mockReset();
  replace.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ForgotPasswordForm", () => {
  it("requests a code, verifies it and goes to the new-password screen", async () => {
    requestReset.mockResolvedValue({ ok: true, value: undefined });
    verifyCode.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderWith(<ForgotPasswordForm initialEmail="me@pulse.test" />);

    expect(screen.getByLabelText(en.emailLabel)).toHaveProperty("value", "me@pulse.test");
    await user.click(screen.getByRole("button", { name: en.sendResetCode }));
    expect(requestReset).toHaveBeenCalledWith("me@pulse.test");

    expect(await screen.findByRole("heading", { name: en.resetCodeTitle })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(en.codeLabel), { target: { value: "123 456" } });
    await act(async () => {});

    expect(verifyCode).toHaveBeenCalledWith({ email: "me@pulse.test", token: "123456" });
    expect(push).toHaveBeenCalledWith("/reset-password");
  });

  it("explains an expired or used code and offers a new one", async () => {
    requestReset.mockResolvedValue({ ok: true, value: undefined });
    verifyCode.mockResolvedValue({ ok: false, error: { code: "identity.code_expired" } });
    const user = userEvent.setup();
    renderWith(<ForgotPasswordForm initialEmail="me@pulse.test" />);

    await user.click(screen.getByRole("button", { name: en.sendResetCode }));
    fireEvent.change(await screen.findByLabelText(en.codeLabel), {
      target: { value: "000000" },
    });

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      en.errors.identity.code_expired,
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Send a new code/ })).toBeTruthy();
  });

  it("keeps the email and code fields left-to-right in Arabic", async () => {
    requestReset.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderWith(<ForgotPasswordForm initialEmail="me@pulse.test" />, "ar");

    expect(screen.getByLabelText(ar.emailLabel).getAttribute("dir")).toBe("ltr");
    await user.click(screen.getByRole("button", { name: ar.sendResetCode }));
    const code = await screen.findByLabelText(ar.codeLabel);
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(code.closest("[dir]")?.parentElement?.closest("[dir='rtl']")).toBeTruthy();
  });
});

describe("ResetPasswordForm", () => {
  async function fill(password: string, confirm: string, locale: "en" | "ar" = "en") {
    const m = locale === "en" ? en : ar;
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(m.newPasswordLabel), password);
    await user.type(screen.getByLabelText(m.confirmPasswordLabel), confirm);
    await user.click(screen.getByRole("button", { name: m.submitNewPassword }));
  }

  it("updates the password and lands in the app with a toast flag", async () => {
    updatePassword.mockResolvedValue({ ok: true, value: undefined });
    renderWith(<ResetPasswordForm />);
    await fill("new-secret1", "new-secret1");

    expect(updatePassword).toHaveBeenCalledWith("new-secret1");
    expect(replace).toHaveBeenCalledWith("/app");
    expect(window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG)).toBe("1");
  });

  it("rejects mismatched passwords without calling the server", async () => {
    renderWith(<ResetPasswordForm />);
    await fill("new-secret1", "new-secreT1");

    expect(updatePassword).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(en.errors.identity.password_mismatch);
    expect(screen.getByLabelText(en.confirmPasswordLabel).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("shows the same-password error in Arabic", async () => {
    updatePassword.mockResolvedValue({ ok: false, error: { code: "identity.password_same" } });
    renderWith(<ResetPasswordForm />, "ar");
    await fill("old-secret1", "old-secret1", "ar");

    expect(screen.getByRole("alert").textContent).toBe(ar.errors.identity.password_same);
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a new code when the reset session has expired", async () => {
    updatePassword.mockResolvedValue({
      ok: false,
      error: { code: "identity.reset_session_expired" },
    });
    renderWith(<ResetPasswordForm />);
    await fill("new-secret1", "new-secret1");

    expect(screen.getByRole("link", { name: en.requestNewCode }).getAttribute("href")).toBe(
      "/forgot-password",
    );
  });
});

describe("PasswordUpdatedToast", () => {
  it("shows once after a reset and then disappears", () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem(PASSWORD_UPDATED_FLAG, "1");
    renderWith(<PasswordUpdatedToast />);

    expect(screen.getByRole("status").textContent).toBe(en.passwordUpdated);
    expect(window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG)).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden on a normal visit", () => {
    renderWith(<PasswordUpdatedToast />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
