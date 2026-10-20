// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { MediaComposerTool } from "./MediaComposerTool";

vi.mock("../context/MediaProvider", () => ({
  MediaProvider: ({ children }: { children: React.ReactNode }) => children,
  useMedia: () => ({
    startUpload: vi.fn(),
    retryUpload: vi.fn(),
    cancelUpload: vi.fn(),
    getUpload: vi.fn(),
    state: { uploadsByClientId: {} },
  }),
}));

const arMessages = {
  media: {
    attachFiles: "إرفاق ملف",
    startRecording: "تسجيل رسالة صوتية",
    stopRecording: "إيقاف التسجيل",
  },
};

describe("MediaComposerTool", () => {
  it("exposes an attach control with an accessible name in Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={arMessages}>
        <MediaComposerTool conversationId="conv-1" disabled={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "إرفاق ملف" })).toBeTruthy();
  });
});
