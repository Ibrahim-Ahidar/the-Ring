// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../messages/en.json";
import { ReactionChip } from "./ReactionChip";

describe("ReactionChip", () => {
  it("exposes an accessible name for the count chip", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ reactions: messages }}>
        <ReactionChip emoji="👍" count={2} reactedByMe={false} onToggle={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /Thumbs up, 2 reactions/i })).toBeTruthy();
  });
});
