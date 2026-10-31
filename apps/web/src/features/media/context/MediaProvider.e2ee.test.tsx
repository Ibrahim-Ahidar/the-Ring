// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  flag: false,
  prepare: vi.fn(async () => ({ ok: false, error: { code: "stop" } })),
  sendEncrypted: vi.fn(async () => ({ ok: true, value: undefined })),
}));

vi.mock("@pulse/core/e2ee-flag", () => ({ isE2eeEnabled: () => m.flag }));
vi.mock("../actions", () => ({
  prepareUploadAction: m.prepare,
  completeUploadAction: vi.fn(),
  failUploadAction: vi.fn(),
}));
vi.mock("../encrypted-send", () => ({ sendEncryptedMedia: m.sendEncrypted }));
vi.mock("../upload-client", () => ({ uploadToSignedTarget: vi.fn() }));
vi.mock("../image-dimensions", () => ({ readImageDimensions: vi.fn(async () => null) }));
vi.mock("../waveform", () => ({ computeWaveform: vi.fn(async () => null) }));
vi.mock("@/features/message-actions/message-actions-events", () => ({ emitMessageMutation: vi.fn() }));

import { MediaProvider, useMedia } from "./MediaProvider";

let start: ReturnType<typeof useMedia>["startUpload"];
function Probe() {
  start = useMedia().startUpload;
  return null;
}

beforeEach(() => {
  m.prepare.mockClear();
  m.sendEncrypted.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

async function attach() {
  render(
    <MediaProvider>
      <Probe />
    </MediaProvider>,
  );
  const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
  await act(async () => {
    await start({ conversationId: "c1", file });
  });
}

describe("MediaProvider attach", () => {
  it("flag on: sends through the encrypted media path and never the legacy storage action", async () => {
    m.flag = true;
    await attach();
    expect(m.sendEncrypted).toHaveBeenCalledTimes(1);
    expect(m.prepare).not.toHaveBeenCalled();
  });

  it("flag off: uses the legacy path unchanged", async () => {
    m.flag = false;
    await attach();
    expect(m.prepare).toHaveBeenCalledTimes(1);
    expect(m.sendEncrypted).not.toHaveBeenCalled();
  });
});
