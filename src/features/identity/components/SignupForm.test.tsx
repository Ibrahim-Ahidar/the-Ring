// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signUpAction } from "../actions";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { SignupForm } from "./SignupForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  signUpAction: vi.fn(),
  verifySignupCodeAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}));

const signUp = vi.mocked(signUpAction);

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return (
    <NextIntlClientProvider locale={locale} messages={{ identity: locale === "en" ? en : ar }}>
      {node}
    </NextIntlClientProvider>
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "newbie");
  await user.type(screen.getByLabelText("Email"), "new@pulse.test");
  await user.type(screen.getByLabelText("Password"), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
}

beforeEach(() => {
  signUp.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("SignupForm", () => {
  it("renders labeled controls in Arabic", () => {
    render(withIntl(<SignupForm />, "ar"));

    expect(screen.getByLabelText("البريد الإلكتروني")).toBeTruthy();
    expect(screen.getByLabelText("كلمة المرور")).toBeTruthy();
    expect(screen.getByLabelText("اسم المستخدم")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء حساب" })).toBeTruthy();
  });

  it("server-renders the submit button disabled until the page's JS loads", () => {
    const html = renderToString(withIntl(<SignupForm />));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("enables the submit button once hydrated", () => {
    render(withIntl(<SignupForm />));
    expect(
      (screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows the code screen when email confirmation is needed", async () => {
    signUp.mockResolvedValue({ ok: true, value: { needsEmailConfirmation: true } });
    render(withIntl(<SignupForm />));
    await fillAndSubmit();

    expect(signUp).toHaveBeenCalledWith({
      email: "new@pulse.test",
      password: "secret-pass",
      username: "newbie",
      displayName: undefined,
    });
    expect(await screen.findByLabelText("6-digit code")).toBeTruthy();
  });

  it("shows the error when signup fails", async () => {
    signUp.mockResolvedValue({ ok: false, error: { code: "identity.email_undeliverable" } });
    render(withIntl(<SignupForm />));
    await fillAndSubmit();

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.errors.identity.email_undeliverable,
    );
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("offers a login link when the email is already registered", async () => {
    signUp.mockResolvedValue({ ok: false, error: { code: "identity.email_registered" } });
    render(withIntl(<SignupForm />));
    await fillAndSubmit();

    expect(await screen.findByRole("link", { name: "Log in instead" })).toBeTruthy();
  });

  it("shows a generic error when the action throws", async () => {
    signUp.mockRejectedValue(new Error("network"));
    render(withIntl(<SignupForm />));
    await fillAndSubmit();

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.errors.platform.unexpected,
    );
  });
});
