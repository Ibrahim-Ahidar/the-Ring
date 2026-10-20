// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/features/locale-appearance/components/CommandPalette";
import {
  AppearanceProvider,
  useAppearanceDispatch,
} from "@/features/locale-appearance/context/AppearanceContext";
import messages from "@/features/locale-appearance/messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/locale-appearance/collect-commands", () => ({
  collectPaletteCommands: () => [
    {
      id: "go-chats",
      labelKey: "locale-appearance.cmdChats",
      href: "/app/chats",
      order: 10,
      feature: "locale-appearance",
    },
  ],
}));

function OpenPaletteOnMount({ children }: { children: ReactNode }) {
  const dispatch = useAppearanceDispatch();
  useEffect(() => {
    dispatch({ type: "open_palette" });
  }, [dispatch]);
  return children;
}

function renderOpenPalette() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "locale-appearance": messages }}>
      <AppearanceProvider initialLocale="en" initialTheme="system">
        <OpenPaletteOnMount>
          <button type="button">Outside</button>
          <CommandPalette />
        </OpenPaletteOnMount>
      </AppearanceProvider>
    </NextIntlClientProvider>,
  );
}

describe("CommandPalette", () => {
  it("does not render when closed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ "locale-appearance": messages }}>
        <AppearanceProvider initialLocale="en" initialTheme="system">
          <CommandPalette />
        </AppearanceProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as an accessible dialog and closes on Escape restoring focus", async () => {
    renderOpenPalette();

    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Command palette" }),
      ).toBeTruthy();
    });

    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(outside);
  });
});
