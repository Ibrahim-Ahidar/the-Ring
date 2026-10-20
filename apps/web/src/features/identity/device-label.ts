/**
 * Device labels are built on the server from the `User-Agent` header and
 * stored as "<Browser> on <OS>" (e.g. "Chrome on Windows"). The settings UI
 * parses that back so it can localise the sentence and pick an icon.
 */

export type DeviceKind = "desktop" | "mobile" | "tablet";

export type DeviceDescription = {
  browser: string;
  os: string;
  kind: DeviceKind;
};

const LABEL_SEPARATOR = " on ";

// Order matters: several browsers also carry "Chrome" or "Safari" tokens.
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const OPERATING_SYSTEMS: ReadonlyArray<[RegExp, string, DeviceKind]> = [
  [/\biPhone\b/, "iPhone", "mobile"],
  [/\biPad\b/, "iPad", "tablet"],
  [/\bAndroid\b.*\bMobile\b/, "Android", "mobile"],
  [/\bAndroid\b/, "Android", "tablet"],
  [/\bCrOS\b/, "ChromeOS", "desktop"],
  [/\bWindows\b/, "Windows", "desktop"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS", "desktop"],
  [/\bLinux\b/, "Linux", "desktop"],
];

const KIND_BY_OS = new Map(OPERATING_SYSTEMS.map(([, os, kind]) => [os, kind]));

function match<T extends [RegExp, string, ...unknown[]]>(
  table: ReadonlyArray<T>,
  userAgent: string,
): T | undefined {
  return table.find(([pattern]) => pattern.test(userAgent));
}

/** "Chrome on Windows", or null when the header names neither a browser nor an OS. */
export function deviceLabelFromUserAgent(
  userAgent: string | null | undefined,
): string | null {
  if (!userAgent) {
    return null;
  }
  const browser = match(BROWSERS, userAgent)?.[1];
  const os = match(OPERATING_SYSTEMS, userAgent)?.[1];
  if (!browser && !os) {
    return null;
  }
  return `${browser ?? "Browser"}${LABEL_SEPARATOR}${os ?? "Unknown OS"}`;
}

/** Reads a stored label back; null for labels this module did not write. */
export function describeDeviceLabel(
  label: string | null | undefined,
): DeviceDescription | null {
  if (!label) {
    return null;
  }
  const at = label.lastIndexOf(LABEL_SEPARATOR);
  if (at <= 0) {
    return null;
  }
  const browser = label.slice(0, at);
  const os = label.slice(at + LABEL_SEPARATOR.length);
  if (!browser || !os) {
    return null;
  }
  return { browser, os, kind: KIND_BY_OS.get(os) ?? "desktop" };
}
