// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { ChatsWelcome } from "./ChatsWelcome";

afterEach(cleanup);

describe("ChatsWelcome", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["ar", ar],
  ] as const)("renders the palette shortcut as keys in %s", (locale, messages) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={{ "direct-messaging": messages }}>
        <ChatsWelcome />
      </NextIntlClientProvider>,
    );

    const keys = [...container.querySelectorAll("kbd")].map((kbd) => kbd.textContent);
    expect(keys).toEqual(["Ctrl", "K"]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
