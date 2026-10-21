// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "@/features/locale-appearance/messages/en.json";

const saveAccent = vi.fn();
vi.mock("@/features/locale-appearance/hooks/use-preference-save", () => ({
  usePreferenceSave: () => ({ saveAccent, pending: false }),
}));

import { AccentOptionList } from "@/features/locale-appearance/components/AccentOptionList";
import { AppearanceProvider } from "@/features/locale-appearance/context/AppearanceContext";

function renderList(accent: "indigo" | "green" = "indigo") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "locale-appearance": messages }}>
      <AppearanceProvider initialLocale="en" initialTheme="system" initialAccent={accent}>
        <AccentOptionList />
      </AppearanceProvider>
    </NextIntlClientProvider>,
  );
}

describe("AccentOptionList", () => {
  afterEach(cleanup);

  it("renders two options and reflects state", () => {
    renderList("green");
    expect(screen.getByRole("radiogroup", { name: "Accent color" })).toBeTruthy();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(screen.getByLabelText("Green")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Indigo")).toHaveProperty("checked", false);
  });

  it("applies data-accent instantly and saves on change", () => {
    renderList("indigo");
    fireEvent.click(screen.getByLabelText("Green"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("green");
    expect(saveAccent).toHaveBeenCalledWith("green", expect.any(Function));
  });

  it("reverts data-accent when the save fails", () => {
    document.documentElement.setAttribute("data-accent", "indigo");
    renderList("indigo");
    fireEvent.click(screen.getByLabelText("Green"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("green");
    const onFailure = saveAccent.mock.calls.at(-1)![1] as () => void;
    onFailure();
    expect(document.documentElement.getAttribute("data-accent")).toBe("indigo");
  });

  it("shows an alert on failure and clears it on the next attempt", () => {
    renderList("indigo");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByLabelText("Green"));
    const onFailure = saveAccent.mock.calls.at(-1)![1] as () => void;
    act(() => onFailure());
    expect(screen.getByRole("alert").textContent).toBe(messages.saveError);
    fireEvent.click(screen.getByLabelText("Green"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
