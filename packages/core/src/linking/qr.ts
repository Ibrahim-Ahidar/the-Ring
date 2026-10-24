import { randomBytes } from "@noble/hashes/utils";

import { fromB64, fromUtf8, toB64, utf8 } from "./bytes";
import { LinkError } from "./errors";

export const LINK_VERSION = 1;
const PREFIX = "pulse-link:1:";

/** What the new Device shows as a QR (spec 4.3): temporary key, Device id, nonce. */
export type LinkQr = { v: 1; pub: string; deviceId: string; nonce: string };

export function newLinkNonce(): string {
  return toB64(randomBytes(16));
}

/** Broadcast topic of the encrypted relay. */
export function linkTopic(nonce: string): string {
  return `link:${nonce}`;
}

export function encodeLinkQr(qr: LinkQr): string {
  return (
    PREFIX +
    toB64(
      utf8(JSON.stringify({ v: qr.v, p: qr.pub, d: qr.deviceId, n: qr.nonce })),
    )
  );
}

export function parseLinkQr(text: string): LinkQr | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const o = JSON.parse(
      fromUtf8(fromB64(text.slice(PREFIX.length))),
    ) as Record<string, unknown>;
    if (o.v !== LINK_VERSION) return null;
    if (
      typeof o.p !== "string" ||
      typeof o.d !== "string" ||
      typeof o.n !== "string"
    )
      return null;
    if (fromB64(o.p).length !== 32 || fromB64(o.n).length < 16 || !o.d)
      return null;
    return { v: 1, pub: o.p, deviceId: o.d, nonce: o.n };
  } catch {
    return null;
  }
}

export function requireLinkQr(text: string): LinkQr {
  const qr = parseLinkQr(text);
  if (!qr) throw new LinkError("invalid_qr");
  return qr;
}
