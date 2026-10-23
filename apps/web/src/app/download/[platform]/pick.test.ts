import { describe, expect, it } from "vitest";

import { pickDownload, type Release } from "./pick";

const release = (tag: string, names: string[], extra: Partial<Release> = {}): Release => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: names.map((name) => ({ name, browser_download_url: `https://dl/${tag}/${name}` })),
  ...extra,
});

describe("pickDownload", () => {
  const releases = [
    release("mobile-v1.2.0", ["pulse-mobile-v1.2.0.apk"]),
    release("desktop-v0.3.0", ["Pulse-Setup-0.3.0.exe"], { draft: true }),
    release("desktop-v0.2.0", ["latest.yml", "Pulse-Setup-0.2.0.exe.blockmap", "Pulse-Setup-0.2.0.exe", "Pulse-0.2.0-universal.dmg"]),
  ];

  it("picks the newest published installer for each platform", () => {
    expect(pickDownload(releases, "desktop")).toBe("https://dl/desktop-v0.2.0/Pulse-Setup-0.2.0.exe");
    expect(pickDownload(releases, "mac")).toBe("https://dl/desktop-v0.2.0/Pulse-0.2.0-universal.dmg");
    expect(pickDownload(releases, "android")).toBe("https://dl/mobile-v1.2.0/pulse-mobile-v1.2.0.apk");
  });

  it("returns null for unknown platforms or when nothing is published", () => {
    expect(pickDownload(releases, "ios")).toBeNull();
    expect(pickDownload([], "desktop")).toBeNull();
  });
});
