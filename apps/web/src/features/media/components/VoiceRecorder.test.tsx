// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onComposerActivity, type ComposerActivity } from "@/platform/composer-events";

import en from "../messages/en.json";
import { VoiceRecorder } from "./VoiceRecorder";

class FakeRecorder {
  static last: FakeRecorder | null = null;
  mimeType = "audio/webm;codecs=opus";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"]) });
    this.onstop?.();
  }
}

const events: ComposerActivity[] = [];
let off: () => void;

beforeEach(() => {
  events.length = 0;
  off = onComposerActivity((a) => events.push(a));
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
});

afterEach(() => {
  off();
  cleanup();
  vi.unstubAllGlobals();
});

function setup(onBlob = vi.fn()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ media: en }}>
      <VoiceRecorder conversationId="c1" disabled={false} onBlob={onBlob} />
    </NextIntlClientProvider>,
  );
  return { onBlob, ...view };
}

async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
  });
}

describe("VoiceRecorder", () => {
  it("shows a mic, then a bar and send arrow while recording", async () => {
    setup();
    await start();
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByText("0:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel recording" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send voice message" })).toBeTruthy();
    expect(events).toEqual([{ kind: "recording", conversationId: "c1", active: true }]);
  });

  it("uploads on send and emits active false", async () => {
    const { onBlob } = setup();
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Send voice message" }));
    expect(onBlob).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ kind: "recording", conversationId: "c1", active: false });
  });

  it("uploads nothing on cancel", async () => {
    const { onBlob } = setup();
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    expect(onBlob).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ kind: "recording", conversationId: "c1", active: false });
    expect(screen.getByRole("button", { name: "Record voice message" })).toBeTruthy();
  });

  it("discards and emits inactive on unmount", async () => {
    const { onBlob, unmount } = setup();
    await start();
    unmount();
    expect(onBlob).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ kind: "recording", conversationId: "c1", active: false });
  });

  it("shows the denied error", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no"));
    setup();
    await start();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(events).toEqual([]);
  });
});
