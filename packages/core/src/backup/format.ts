/**
 * Encrypted backup container (spec section 8).
 *
 * A random 32-byte backup key encrypts the payload with XChaCha20-Poly1305 in chunks. The backup
 * key is wrapped by a key-encryption key derived from a passphrase (Argon2id) or from a 64-digit
 * recovery key. Each chunk has its own nonce (random prefix, chunk index, final flag) and
 * authenticates the whole header, its index and a final marker, so reordering, dropping or
 * truncating chunks is detected.
 *
 * Layout (big-endian):
 *   0   magic "PBK1"            4   version (1)        5   wrap kind (1 passphrase, 2 recovery)
 *   6   argon2 m KiB (u32)     10   argon2 t (u32)     14  argon2 p (u16)
 *   16  salt (16)              32   wrap nonce (24)    56  wrapped backup key (32 + 16 tag)
 *   104 chunk size (u32)      108   nonce prefix (19)  127 chunks: u32 length + ciphertext
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { argon2idAsync } from "@noble/hashes/argon2";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";

import { BackupError } from "./errors";

const MAGIC = [0x50, 0x42, 0x4b, 0x31]; // "PBK1"
const VERSION = 1;
const HEADER_LEN = 127;
const TAG = 16;
const WRAP_END = 56;
const WRAPPED_END = 104;
const DEFAULT_CHUNK = 64 * 1024;
const MAX_CHUNK = 16 * 1024 * 1024;

export type Argon2Params = { m: number; t: number; p: number };
/** 64 MiB, 3 passes: a sound interactive default for browsers. */
export const DEFAULT_ARGON2: Argon2Params = { m: 64 * 1024, t: 3, p: 1 };
const MAX_ARGON2: Argon2Params = { m: 512 * 1024, t: 16, p: 4 };

export type BackupSecret =
  | { kind: "passphrase"; passphrase: string }
  | { kind: "recovery"; recoveryKey: string };

export type EncryptOptions = {
  chunkSize?: number;
  /** Lower only in tests. */
  argon2?: Argon2Params;
};

const enc = new TextEncoder();

/** 64 random decimal digits, grouped as 16 blocks of 4 for writing down. */
export function createRecoveryKey(): string {
  const digits: string[] = [];
  while (digits.length < 64) {
    for (const b of randomBytes(128)) {
      if (b < 250 && digits.length < 64) digits.push(String(b % 10));
    }
  }
  return Array.from({ length: 16 }, (_, i) => digits.slice(i * 4, i * 4 + 4).join("")).join("-");
}

export function normalizeRecoveryKey(input: string): string {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^[0-9]{64}$/.test(digits)) {
    throw new BackupError("invalid_secret", "A recovery key is 64 digits");
  }
  return digits;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function deriveKek(
  kind: number,
  secret: BackupSecret,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<Uint8Array> {
  if (kind === 1) {
    if (secret.kind !== "passphrase") throw new BackupError("invalid_secret", "Passphrase needed");
    const pass = secret.passphrase.normalize("NFKC");
    if (!pass) throw new BackupError("invalid_secret", "Empty passphrase");
    return argon2idAsync(pass, salt, { ...params, dkLen: 32 });
  }
  if (secret.kind !== "recovery") throw new BackupError("invalid_secret", "Recovery key needed");
  const digits = normalizeRecoveryKey(secret.recoveryKey);
  return hkdf(sha256, enc.encode(digits), salt, enc.encode("pulse-backup-v1 recovery"), 32);
}

function nonceFor(prefix: Uint8Array, index: number, final: boolean): Uint8Array {
  return concat([prefix, u32(index), Uint8Array.of(final ? 1 : 0)]);
}

function chunkAad(header: Uint8Array, index: number, final: boolean): Uint8Array {
  return concat([header, u32(index), Uint8Array.of(final ? 1 : 0)]);
}

function wrapAad(header: Uint8Array): Uint8Array {
  return concat([header.subarray(0, WRAP_END), header.subarray(WRAPPED_END)]);
}

/** Encrypts `plaintext` (any size, cut into chunks) into a backup file. */
export async function encryptBackup(
  plaintext: Uint8Array,
  secret: BackupSecret,
  opts: EncryptOptions = {},
): Promise<Uint8Array> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK) {
    throw new RangeError("chunkSize out of range");
  }
  const params = opts.argon2 ?? DEFAULT_ARGON2;
  const kind = secret.kind === "passphrase" ? 1 : 2;
  const salt = randomBytes(16);
  const wrapNonce = randomBytes(24);
  const prefix = randomBytes(19);
  const backupKey = randomBytes(32);

  const header = new Uint8Array(HEADER_LEN);
  const dv = new DataView(header.buffer);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  header[5] = kind;
  if (kind === 1) {
    dv.setUint32(6, params.m, false);
    dv.setUint32(10, params.t, false);
    dv.setUint16(14, params.p, false);
  }
  header.set(salt, 16);
  header.set(wrapNonce, 32);
  dv.setUint32(WRAPPED_END, chunkSize, false);
  header.set(prefix, 108);

  const kek = await deriveKek(kind, secret, salt, params);
  const wrapped = xchacha20poly1305(kek, wrapNonce, wrapAad(header)).encrypt(backupKey);
  header.set(wrapped, WRAP_END);

  const parts: Uint8Array[] = [header];
  const total = Math.max(1, Math.ceil(plaintext.length / chunkSize));
  for (let i = 0; i < total; i++) {
    const final = i === total - 1;
    const slice = plaintext.subarray(i * chunkSize, (i + 1) * chunkSize);
    const ct = xchacha20poly1305(
      backupKey,
      nonceFor(prefix, i, final),
      chunkAad(header, i, final),
    ).encrypt(slice);
    parts.push(u32(ct.length), ct);
  }
  backupKey.fill(0);
  return concat(parts);
}

/**
 * Verifies and decrypts a whole backup. Nothing is returned unless every chunk authenticates and
 * the final chunk is present, so a caller never applies half of a damaged file.
 */
export async function decryptBackup(
  file: Uint8Array,
  secret: BackupSecret,
): Promise<Uint8Array> {
  if (file.length < 5 || MAGIC.some((b, i) => file[i] !== b)) {
    throw new BackupError("unsupported", "Not a Pulse backup");
  }
  if (file[4] !== VERSION) throw new BackupError("unsupported", "Unknown backup version");
  if (file.length < HEADER_LEN) throw new BackupError("truncated", "Header cut short");
  const header = file.slice(0, HEADER_LEN);
  const dv = new DataView(header.buffer);
  const kind = header[5];
  if (kind !== 1 && kind !== 2) throw new BackupError("unsupported", "Unknown wrap kind");
  const params: Argon2Params = {
    m: dv.getUint32(6, false),
    t: dv.getUint32(10, false),
    p: dv.getUint16(14, false),
  };
  if (kind === 1) {
    if (
      params.m < 8 * params.p ||
      params.t < 1 ||
      params.p < 1 ||
      params.m > MAX_ARGON2.m ||
      params.t > MAX_ARGON2.t ||
      params.p > MAX_ARGON2.p
    ) {
      throw new BackupError("corrupt", "Unreasonable key-derivation parameters");
    }
  }
  const chunkSize = dv.getUint32(WRAPPED_END, false);
  if (chunkSize < 1 || chunkSize > MAX_CHUNK) throw new BackupError("corrupt", "Bad chunk size");

  const kek = await deriveKek(kind, secret, header.subarray(16, 32), params);
  let backupKey: Uint8Array;
  try {
    backupKey = xchacha20poly1305(kek, header.subarray(32, 56), wrapAad(header)).decrypt(
      header.subarray(WRAP_END, WRAPPED_END),
    );
  } catch {
    throw new BackupError("wrong_secret", "Wrong passphrase or recovery key");
  }

  const prefix = header.subarray(108, 127);
  const out: Uint8Array[] = [];
  let offset = HEADER_LEN;
  let index = 0;
  if (offset >= file.length) throw new BackupError("truncated", "No chunks");
  while (offset < file.length) {
    if (offset + 4 > file.length) throw new BackupError("truncated", "Chunk length cut short");
    const len = new DataView(file.buffer, file.byteOffset + offset, 4).getUint32(0, false);
    offset += 4;
    if (len < TAG || len > chunkSize + TAG) throw new BackupError("corrupt", "Bad chunk length");
    if (offset + len > file.length) throw new BackupError("truncated", "Chunk cut short");
    const ct = file.subarray(offset, offset + len);
    offset += len;
    const last = offset === file.length;
    try {
      out.push(
        xchacha20poly1305(backupKey, nonceFor(prefix, index, last), chunkAad(header, index, last)).decrypt(ct),
      );
    } catch {
      if (last && opens(backupKey, prefix, header, index, false, ct)) {
        // A valid non-final chunk at the end means the real tail was cut off.
        throw new BackupError("truncated", "Final chunk missing");
      }
      throw new BackupError("corrupt", "A chunk failed authentication");
    }
    index++;
  }
  backupKey.fill(0);
  return concat(out);
}

function opens(
  key: Uint8Array,
  prefix: Uint8Array,
  header: Uint8Array,
  index: number,
  final: boolean,
  ct: Uint8Array,
): boolean {
  try {
    xchacha20poly1305(key, nonceFor(prefix, index, final), chunkAad(header, index, final)).decrypt(ct);
    return true;
  } catch {
    return false;
  }
}
