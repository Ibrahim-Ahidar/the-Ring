// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkUsernameAvailabilityAction, signUpAction } from "../actions";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { SignupForm, USERNAME_CHECK_DELAY_MS } from "./SignupForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  signUpAction: vi.fn(),
  checkUsernameAvailabilityAction: vi.fn(),
  verifySignupCodeAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}));

const signUp = vi.mocked(signUpAction);
const checkUsername = vi.mocked(checkUsernameAvailabilityAction);

function renderSignup(locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ identity: locale === "en" ? en : ar }}>
      <SignupForm />
    </NextIntlClientProvider>,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "new@pulse.test");
  await user.type(screen.getByLabelText("Username"), "new_member");
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.type(screen.getByLabelText("Confirm password"), "secret123");
}

beforeEach(() => {
  signUp.mockReset();
  checkUsername.mockReset().mockResolvedValue({ ok: true, value: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SignupForm", () => {
  it("renders labeled controls in Arabic", () => {
    renderSignup("ar");

    expect(screen.getByLabelText("البريد الإلكتروني")).toBeTruthy();
    expect(screen.getByLabelText("كلمة المرور")).toBeTruthy();
    expect(screen.getByLabelText("اسم المستخدم")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء حساب" })).toBeTruthy();
  });

  it("puts required fields first and the display name last, focusing email", () => {
    renderSignup();
    const ids = [...document.querySelectorAll("input")].map((input) => input.id);
    expect(ids).toEqual([
      "signup-email",
      "signup-username",
      "signup-password",
      "signup-confirm",
      "signup-display",
    ]);
    expect(document.activeElement?.id).toBe("signup-email");
  });

  it("shows the password rules up front", () => {
    renderSignup();
    expect(
      screen.getByText("At least 8 characters, including a letter (a–z) and a number."),
    ).toBeTruthy();
  });

  it("validates every field inline before any request", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText("Email"), "bad");
    await user.type(screen.getByLabelText("Username"), "1x");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toBe("signup-email");
  });

  it("asks to confirm a matching password", async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText("Email"), "new@pulse.test");
    await user.type(screen.getByLabelText("Username"), "new_member");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm password"), "secret124");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(document.activeElement?.id).toBe("signup-confirm");
  });

  it("maps a weak password from the server to the password field", async () => {
    signUp.mockResolvedValue({ ok: false, error: { code: "identity.password_weak" } });
    const user = userEvent.setup();
    renderSignup();

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      await screen.findByText(
        "That password is too weak. Use at least 8 characters, including a letter (a–z) and a number.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement?.id).toBe("signup-password");
  });

  it("checks username availability after a pause", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignup();

    await user.type(screen.getByLabelText("Username"), "new_member");
    expect(screen.getByText("Checking availability…")).toBeTruthy();
    expect(checkUsername).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS));
    expect(checkUsername).toHaveBeenCalledTimes(1);
    expect(checkUsername).toHaveBeenCalledWith("new_member");
    expect(screen.getByText("@new_member is available")).toBeTruthy();
  });

  it("blocks a taken username before submitting", async () => {
    checkUsername.mockResolvedValue({ ok: true, value: false });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignup();

    await fillValid(user);
    await act(() => vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS));
    expect(screen.getByText("That username is already taken.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(signUp).not.toHaveBeenCalled();
  });

  it("ignores an availability answer for a username that was since edited", async () => {
    let answerFirst: (value: { ok: true; value: boolean }) => void = () => {};
    checkUsername
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ ok: true, value: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignup();
    const username = screen.getByLabelText("Username");

    await user.type(username, "taken_one");
    await act(() => vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS));
    await user.type(username, "x");
    await act(async () => answerFirst({ ok: true, value: false }));

    expect(screen.queryByText("That username is already taken.")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS));
    expect(screen.getByText("@taken_onex is available")).toBeTruthy();
  });

  it("labels the pending button", async () => {
    signUp.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderSignup();

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(
      screen.getByRole("button", { name: "Creating account…" }).getAttribute("aria-busy"),
    ).toBe("true");
  });
});
