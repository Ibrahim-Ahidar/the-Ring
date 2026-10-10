// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { RequestRequiredForm } from "./RequestRequiredForm";

vi.mock("../actions", () => ({
  createRequestAction: vi.fn(),
}));

describe("RequestRequiredForm", () => {
  it("exposes an accessible note field in Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ "message-requests": ar }}>
        <RequestRequiredForm targetUserId="friend" onDone={() => undefined} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("ملاحظة (اختياري)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إرسال الطلب" })).toBeTruthy();
  });
});
