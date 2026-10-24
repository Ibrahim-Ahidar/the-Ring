import type { MailboxEnvelope, WireEnvelope } from "./types";

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Plaintext envelope body used until real encryption lands: JSON as UTF-8. */
export function encodePlaintext(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function decodePlaintext<T = unknown>(payload: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(payload)) as T;
}

export function fromWire(w: WireEnvelope): MailboxEnvelope {
  return {
    seq: Number(w.seq ?? 0),
    id: w.id,
    senderDeviceId: w.sender_device_id,
    senderUserId: w.sender_user_id,
    conversationId: w.conversation_id,
    kind: w.kind,
    payload: base64ToBytes(w.ciphertext),
    createdAt: w.created_at,
  };
}

/** True when the envelope is too big for a Broadcast frame (send the id only). */
export function isLargePayload(payload: Uint8Array, max: number): boolean {
  return payload.length > max;
}
