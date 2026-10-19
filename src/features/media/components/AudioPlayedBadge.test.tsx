// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import { AudioPlayedBadge } from "./AudioPlayedBadge";

const played = vi.hoisted(() => ({ value: false }));
vi.mock("../hooks/useAudioPlayed", () => ({
  useAudioPlayed: () => played.value,
}));

const messages = { media: { audioPlayed: "Played", audioNotPlayed: "Not played yet" } };

function msg(over: Partial<TimelineMessage>): TimelineMessage {
  return { id: "m1", type: "audio", sender_id: "me", status: "sent", ...over } as TimelineMessage;
}

function renderBadge(message: TimelineMessage) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AudioPlayedBadge message={message} currentUserId="me" />
    </NextIntlClientProvider>,
  );
}

describe("AudioPlayedBadge", () => {
  afterEach(cleanup);

  it("shows not-played state on own voice note", () => {
    played.value = false;
    renderBadge(msg({}));
    expect(screen.getByRole("img", { name: "Not played yet" }).getAttribute("data-played")).toBe("false");
  });

  it("switches to played state", () => {
    played.value = true;
    renderBadge(msg({}));
    expect(screen.getByRole("img", { name: "Played" }).getAttribute("data-played")).toBe("true");
  });

  it("is hidden for peer voice notes and non-audio messages", () => {
    played.value = true;
    renderBadge(msg({ sender_id: "peer" }));
    expect(screen.queryByRole("img")).toBeNull();
    cleanup();
    renderBadge(msg({ type: "text" }));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
