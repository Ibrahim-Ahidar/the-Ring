/**
 * Security Code (spec 4.4), modelled on Signal safety numbers.
 * Pure and platform-neutral: hashing uses an injected sha512 (default: WebCrypto subtle).
 */

export const SECURITY_CODE_ROUNDS = 5200;
const CHUNKS = 6;
const BYTES_PER_CHUNK = 5;

export type Sha512 = (data: Uint8Array) => Promise<Uint8Array>;

export const webCryptoSha512: Sha512 = async (data) => {
  const copy = new Uint8Array(data);
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-512", copy));
};

export type FingerprintInput = {
  version: number;
  /** Account Signing Key bytes (decoded). */
  signingKey: Uint8Array;
  userId: string;
};

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 30 digits for one user: 5200 rounds of SHA-512 over version || key || userId. */
export async function computeFingerprint(
  input: FingerprintInput,
  sha512: Sha512 = webCryptoSha512,
): Promise<string> {
  const version = new Uint8Array([(input.version >>> 8) & 0xff, input.version & 0xff]);
  const user = new TextEncoder().encode(input.userId);
  let hash = concat(version, input.signingKey, user);
  for (let i = 0; i < SECURITY_CODE_ROUNDS; i++) {
    hash = await sha512(concat(hash, input.signingKey));
  }
  let digits = "";
  for (let c = 0; c < CHUNKS; c++) {
    let n = 0;
    for (let b = 0; b < BYTES_PER_CHUNK; b++) {
      n = n * 256 + hash[c * BYTES_PER_CHUNK + b]!;
    }
    digits += String(n % 100000).padStart(5, "0");
  }
  return digits;
}

/** 60 digits: both fingerprints in sorted order, identical for either argument order. */
export function securityCode(a: string, b: string): string {
  return a <= b ? a + b : b + a;
}

/** Groups of five digits, for display. */
export function formatSecurityCode(code: string): string[] {
  return code.match(/.{1,5}/g) ?? [];
}

export type QrPayload = { version: number; fingerprints: [string, string] };

const QR_PREFIX = "pulse-sc1";

/** `pulse-sc1:<version>:<fp lo>:<fp hi>` with fingerprints sorted. */
export function encodeQrPayload(version: number, a: string, b: string): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `${QR_PREFIX}:${version}:${lo}:${hi}`;
}

export function parseQrPayload(text: string): QrPayload | null {
  const m = /^pulse-sc1:(\d{1,9}):(\d{30}):(\d{30})$/.exec(text.trim());
  if (!m) return null;
  return { version: Number(m[1]), fingerprints: [m[2]!, m[3]!] };
}

export type ScanResult = "match" | "mismatch" | "invalid";

/** Compares the payload we computed locally with a scanned QR payload. */
export function verifyScan(local: string, scanned: string): ScanResult {
  const l = parseQrPayload(local);
  const s = parseQrPayload(scanned);
  if (!l || !s) return "invalid";
  return l.version === s.version &&
    l.fingerprints[0] === s.fingerprints[0] &&
    l.fingerprints[1] === s.fingerprints[1]
    ? "match"
    : "mismatch";
}

/* ---------- Local verification store ---------- */

export type VerifiedContact = { contactId: string; signingKey: string; verifiedAt: number };

export interface VerificationStorage {
  load(): VerifiedContact[];
  save(list: VerifiedContact[]): void;
}

export function memoryVerificationStorage(initial: VerifiedContact[] = []): VerificationStorage {
  let data = [...initial];
  return {
    load: () => [...data],
    save: (l) => {
      data = [...l];
    },
  };
}

export function createVerificationStore(
  storage: VerificationStorage,
  now: () => number = Date.now,
) {
  const unverify = (contactId: string): void => {
    storage.save(storage.load().filter((v) => v.contactId !== contactId));
  };
  return {
    /** Marks the contact verified against the given signing key (replaces any earlier record). */
    markVerified(contactId: string, signingKey: string): void {
      const rest = storage.load().filter((v) => v.contactId !== contactId);
      storage.save([...rest, { contactId, signingKey, verifiedAt: now() }]);
    },
    unverify,
    isVerified(contactId: string, currentKey: string): boolean {
      return storage.load().some((v) => v.contactId === contactId && v.signingKey === currentKey);
    },
    /** True when the contact was verified against a different key than the current one. */
    needsKeyChangeWarning(contactId: string, currentKey: string): boolean {
      const rec = storage.load().find((v) => v.contactId === contactId);
      return !!rec && rec.signingKey !== currentKey;
    },
    /** The user acknowledged the change: the contact is no longer marked verified. */
    acknowledgeKeyChange: unverify,
  };
}
export type VerificationStore = ReturnType<typeof createVerificationStore>;
