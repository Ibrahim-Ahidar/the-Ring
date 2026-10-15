// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { LOGIN_REASONS, type LoginReason } from "@/platform/login-redirect";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { LoginReasonBanner } from "./LoginReasonBanner";

afterEach(cleanup);

function renderBanner(reason: LoginReason, locale: "en" | "fr" | "ar", messages: typeof en) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ identity: messages }}>
      <LoginReasonBanner reason={reason} />
    </NextIntlClientProvider>,
  );
}

describe("LoginReasonBanner", () => {
  it("explains a revoked session as a status message", () => {
    renderBanner("identity.session_revoked", "en", en);
    expect(screen.getByRole("status").textContent).toBe(
      "This session was revoked. Sign in again.",
    );
  });

  it("has a specific message for an expired link", () => {
    renderBanner("link_expired", "en", en);
    expect(screen.getByRole("status").textContent).toMatch(/expired/);
  });

  it.each(
    LOGIN_REASONS.flatMap((reason) =>
      (
        [
          ["en", en],
          ["fr", fr],
          ["ar", ar],
        ] as const
      ).map(([locale, messages]) => [reason, locale, messages] as const),
    ),
  )("translates %s in %s", (reason, locale, messages) => {
    renderBanner(reason, locale, messages as typeof en);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).not.toBe("");
    expect(text).not.toContain("identity.reasons");
  });
});
