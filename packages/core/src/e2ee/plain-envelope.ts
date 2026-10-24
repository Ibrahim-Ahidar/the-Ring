import { padPlaintext } from "./padding";

/** The decrypted body of a message envelope (spec 6.2). */
export type PlainEnvelope = {
  v: 1;
  /** Client-generated message id (the outbox client id); the local row id. */
  id: string;
  conversationId: string;
  sentAt: string;
  kind: "text";
  body: string;
  replyToId?: string | null;
};

/** Mailbox envelope `kind` for an Olm-encrypted message (type 0/1 is inside the payload). */
export const ENCRYPTED_ENVELOPE_KIND = 2;

export function encodePlainEnvelope(p: PlainEnvelope): string {
  return padPlaintext(JSON.stringify(p));
}

/** Parses and validates a decrypted body; returns null when it is not a v1 text envelope. */
export function decodePlainEnvelope(text: string): PlainEnvelope | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    o.v !== 1 ||
    o.kind !== "text" ||
    typeof o.id !== "string" ||
    typeof o.conversationId !== "string" ||
    typeof o.sentAt !== "string" ||
    typeof o.body !== "string"
  ) {
    return null;
  }
  return o as unknown as PlainEnvelope;
}

/** Wire form of an Olm message inside the mailbox payload: JSON {t, b} as UTF-8. */
export function encodeOlmPayload(m: { type: 0 | 1; body: string }): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ t: m.type, b: m.body }));
}

export function decodeOlmPayload(payload: Uint8Array): { type: 0 | 1; body: string } | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(payload)) as { t?: unknown; b?: unknown };
    if ((o.t !== 0 && o.t !== 1) || typeof o.b !== "string") return null;
    return { type: o.t, body: o.b };
  } catch {
    return null;
  }
}
