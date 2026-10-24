import { ed25519 } from "@noble/curves/ed25519";

import { toB64, utf8 } from "./bytes";
import { accountPublicKey } from "./session";

/** A fresh 32-byte Account Signing Key seed (spec 4: its own Ed25519 key, not the device key). */
export function generateAccountSeed(): Uint8Array {
  return ed25519.utils.randomPrivateKey();
}

/** Signs a device identity key (any text) as the account; returns unpadded base64url. */
export function signAsAccount(seed: Uint8Array, text: string): string {
  return toB64(ed25519.sign(utf8(text), seed));
}

export { accountPublicKey };
