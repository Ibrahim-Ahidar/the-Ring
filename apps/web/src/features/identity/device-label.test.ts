import { describe, expect, it } from "vitest";

import { describeDeviceLabel, deviceLabelFromUserAgent } from "./device-label";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  firefoxMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
};

describe("deviceLabelFromUserAgent", () => {
  it.each([
    [UA.chromeWindows, "Chrome on Windows"],
    [UA.firefoxMac, "Firefox on macOS"],
    [UA.safariIphone, "Safari on iPhone"],
    [UA.edgeWindows, "Edge on Windows"],
    [UA.chromeAndroid, "Chrome on Android"],
    [UA.safariIpad, "Safari on iPad"],
  ])("labels %s", (ua, label) => {
    expect(deviceLabelFromUserAgent(ua)).toBe(label);
  });

  it("returns null when there is nothing to recognise", () => {
    expect(deviceLabelFromUserAgent(null)).toBeNull();
    expect(deviceLabelFromUserAgent("")).toBeNull();
    expect(deviceLabelFromUserAgent("curl/8.4.0")).toBeNull();
  });
});

describe("describeDeviceLabel", () => {
  it("reads a stored label back with its device kind", () => {
    expect(describeDeviceLabel("Safari on iPhone")).toEqual({
      browser: "Safari",
      os: "iPhone",
      kind: "mobile",
    });
    expect(describeDeviceLabel("Firefox on macOS")?.kind).toBe("desktop");
    expect(describeDeviceLabel("Safari on iPad")?.kind).toBe("tablet");
  });

  it("ignores labels it did not write", () => {
    expect(describeDeviceLabel(null)).toBeNull();
    expect(describeDeviceLabel("My laptop")).toBeNull();
  });
});
