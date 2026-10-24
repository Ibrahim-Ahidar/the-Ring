import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";

import { concat, fromB64, fromUtf8, toB64, utf8 } from "./bytes";
import { LinkError } from "./errors";

export type LinkRole = "new" | "existing";

/** What crosses the relay. Only `hello` carries a (public) key in clear; everything else is ciphertext. */
export type LinkFrame =
  | { t: "hello"; r: "existing"; pub: string }
  | { t: "msg"; r: LinkRole; n: number; c: string };

/** A Broadcast-like pipe. The server only ever sees LinkFrame values. */
export interface LinkTransport {
  send(frame: LinkFrame): Promise<void> | void;
  subscribe(listener: (frame: LinkFrame) => void): () => void;
}

export function createEphemeralKey(): { secret: Uint8Array; pub: string } {
  const secret = randomBytes(32);
  return { secret, pub: toB64(x25519.getPublicKey(secret)) };
}

export type LinkChannel = {
  /** Six digits both Devices display; the user confirms they match. */
  safetyCode: string;
  seal(message: unknown): LinkFrame;
  open(frame: LinkFrame): unknown;
};

export function createLinkChannel(args: {
  role: LinkRole;
  nonce: string;
  ownSecret: Uint8Array;
  newPub: string;
  existingPub: string;
}): LinkChannel {
  const peerPub = args.role === "new" ? args.existingPub : args.newPub;
  const shared = x25519.getSharedSecret(args.ownSecret, fromB64(peerPub));
  const info = concat(utf8("pulse-link-v1"), fromB64(args.newPub), fromB64(args.existingPub));
  const key = hkdf(sha256, shared, utf8(args.nonce), info, 32);
  const sas = hkdf(sha256, key, undefined, utf8("sas"), 4);
  const num = ((sas[0] << 24) | (sas[1] << 16) | (sas[2] << 8) | sas[3]) >>> 0;
  const safetyCode = String(num % 1_000_000).padStart(6, "0");
  const peer: LinkRole = args.role === "new" ? "existing" : "new";
  let sent = 0;
  let lastSeen = 0;
  const ad = (role: LinkRole, n: number) => utf8(`${args.nonce}|${role}|${n}`);

  return {
    safetyCode,
    seal(message) {
      const n = ++sent;
      const nonce24 = randomBytes(24);
      const ct = xchacha20poly1305(key, nonce24, ad(args.role, n)).encrypt(
        utf8(JSON.stringify(message)),
      );
      return { t: "msg", r: args.role, n, c: toB64(concat(nonce24, ct)) };
    },
    open(frame) {
      if (frame.t !== "msg" || frame.r !== peer) throw new LinkError("bad_frame");
      if (!Number.isInteger(frame.n) || frame.n <= lastSeen) throw new LinkError("replay");
      let plain: Uint8Array;
      try {
        const raw = fromB64(frame.c);
        plain = xchacha20poly1305(key, raw.subarray(0, 24), ad(peer, frame.n)).decrypt(
          raw.subarray(24),
        );
      } catch {
        throw new LinkError("auth");
      }
      lastSeen = frame.n;
      return JSON.parse(fromUtf8(plain));
    },
  };
}
