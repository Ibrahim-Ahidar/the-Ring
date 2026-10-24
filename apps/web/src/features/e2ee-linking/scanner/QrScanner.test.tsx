// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QrScanner } from "./QrScanner";

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

beforeEach(() => {
  vi.useFakeTimers();
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  Object.defineProperty(globalThis, "BarcodeDetector", {
    configurable: true,
    value: class {
      detect = vi.fn(async () => [{ rawValue: "pulse-link:payload" }]);
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, "BarcodeDetector");
});

function setMedia(getUserMedia: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
}

describe("QrScanner", () => {
  it("reports the decoded text once and stops the camera", async () => {
    const { track, stream } = fakeStream();
    setMedia(vi.fn(async () => stream));
    const onDecode = vi.fn();
    render(<QrScanner onDecode={onDecode} onFailure={vi.fn()} label="cam" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(onDecode).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("pulse-link:payload");
    expect(track.stop).toHaveBeenCalled();
  });

  it("reports denied when permission is refused", async () => {
    setMedia(vi.fn(async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }))));
    const onFailure = vi.fn();
    render(<QrScanner onDecode={vi.fn()} onFailure={onFailure} label="cam" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(onFailure).toHaveBeenCalledWith("denied");
  });

  it("reports unavailable when there is no camera API or device", async () => {
    setMedia(undefined);
    const onFailure = vi.fn();
    render(<QrScanner onDecode={vi.fn()} onFailure={onFailure} label="cam" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(onFailure).toHaveBeenCalledWith("unavailable");
  });

  it("stops every camera track on unmount", async () => {
    const { track, stream } = fakeStream();
    Reflect.deleteProperty(globalThis, "BarcodeDetector");
    setMedia(vi.fn(async () => stream));
    const { unmount } = render(<QrScanner onDecode={vi.fn()} onFailure={vi.fn()} label="cam" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(track.stop).not.toHaveBeenCalled();
    unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
