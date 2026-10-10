// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { NewGroupForm } from "./NewGroupForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../actions", () => ({
  createGroupAction: vi.fn(),
  uploadGroupAvatarAction: vi.fn(),
}));

describe("NewGroupForm", () => {
  it("renders the Arabic name field with an accessible label", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ groups: ar }}>
        <NewGroupForm />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("اسم المجموعة")).toBeTruthy();
  });
});
