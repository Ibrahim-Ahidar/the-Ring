// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInAction } from "../actions";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { LoginForm } from "./LoginForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  signInAction: vi.fn(),
  verifySignupCodeAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}));

const signIn = vi.mocked(signInAction);

function renderLogin(props: { next?: string } = {}, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ identity: locale === "en" ? en : ar }}>
      <LoginForm {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  signIn.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("LoginForm", () => {
  it("focuses the email field first", () => {
    renderLogin();
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("shows inline errors without calling the server", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("rejects a malformed email and clears the error while typing", async () => {
    const user = userEvent.setup();
    renderLogin();
    const email = screen.getByLabelText("Email");

    await user.type(email, "nope");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();

    await user.type(email, "@pulse.test");
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
  });

  it("links rejected credentials to both fields and clears the banner on edit", async () => {
    signIn.mockResolvedValue({ ok: false, error: { code: "identity.credentials_rejected" } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "a@pulse.test");
    await user.type(screen.getByLabelText("Password"), "wrong-pass1");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const banner = await screen.findByRole("alert");
    expect(banner.id).toBe("login-feedback");
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("aria-describedby")).toContain("login-feedback");
    expect(document.activeElement).toBe(password);

    await user.type(password, "2");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes to the deep link after signing in", async () => {
    signIn.mockResolvedValue({ ok: true, value: { mfaRequired: false } });
    const user = userEvent.setup();
    renderLogin({ next: "/app/chats/123" });

    await user.type(screen.getByLabelText("Email"), "a@pulse.test");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(push).toHaveBeenCalledWith("/app/chats/123");
  });

  it("labels the pending button and marks it busy", async () => {
    signIn.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "a@pulse.test");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const button = screen.getByRole("button", { name: "Logging in…" });
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("shows and hides the password with a translated label", async () => {
    const user = userEvent.setup();
    renderLogin({}, "ar");
    const password = screen.getByLabelText("كلمة المرور");
    expect(password.getAttribute("type")).toBe("password");

    await user.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(password.getAttribute("type")).toBe("text");

    const hide = screen.getByRole("button", { name: "إخفاء كلمة المرور" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
  });
});
