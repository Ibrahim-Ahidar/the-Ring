// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { SignupForm } from "./SignupForm";

vi.mock("../actions", () => ({
  signUpAction: vi.fn(),
}));

describe("SignupForm", () => {
  it("renders labeled controls in Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ identity: ar }}>
        <SignupForm />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("البريد الإلكتروني")).toBeTruthy();
    expect(screen.getByLabelText("كلمة المرور")).toBeTruthy();
    expect(screen.getByLabelText("اسم المستخدم")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء حساب" })).toBeTruthy();
  });
});
