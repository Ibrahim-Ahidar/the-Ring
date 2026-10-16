// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "@/shell/messages/en.json";
import fr from "@/shell/messages/fr.json";

const reportError = vi.fn();
const refresh = vi.fn();
vi.mock("@/platform/telemetry", () => ({ reportError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ErrorScreen } from "./ErrorScreen";
import { LoadFailed } from "./LoadFailed";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(locale: "en" | "fr", node: React.ReactNode) {
  const shell = locale === "en" ? en : fr;
  return render(
    <NextIntlClientProvider locale={locale} messages={{ shell }}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("ErrorScreen", () => {
  it("reports the error and retries via reset", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc" });
    wrap("en", <ErrorScreen error={error} reset={reset} boundary="app" />);
    expect(reportError).toHaveBeenCalledWith(error, { boundary: "app", digest: "abc" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByText("Reference: abc")).toBeTruthy();
  });

  it("renders localized copy", () => {
    wrap("fr", <ErrorScreen error={new Error("x")} reset={() => {}} boundary="app" />);
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});

describe("LoadFailed", () => {
  it("offers a retry that refreshes the route", () => {
    wrap("en", <LoadFailed />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });
});
