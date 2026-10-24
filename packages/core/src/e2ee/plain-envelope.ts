import { padPlaintext } from "./padding";

type EnvelopeBase = {
  v: 1;
  /** Client-generated id; for text it is the message id and the local row id. */
  id: string;
  conversationId: string;
  sentAt: string;
};

export type TextEnvelope = EnvelopeBase & {
  kind: "text";
  body: string;
  replyToId?: string | null;
};

/** Control Message bodies (spec 5.1): every one names the message(s) it is about. */
export type ControlBodies = {
  reaction: { messageId: string; emoji: string; remove?: boolean };
  edit: { messageId: string; body: string };
  delete: { messageId: string };
  receipt: { messageIds: string[] };
  read: { messageIds: string[] };
  audio_play: { messageId: string };
  pin: { messageId: string; pinned: boolean };
};

export type ControlKind = keyof ControlBodies;

export type ControlEnvelope = {
  [K in ControlKind]: EnvelopeBase & { kind: K; body: ControlBodies[K] };
}[ControlKind];

/** Key-sharing Control Messages (spec 5.4). They only ever travel inside Olm envelopes. */
export type KeyBodies = {
  /** Megolm session key of the sender Device for this group. */
  sender_key: { sessionId: string; sessionKey: string };
  /** Symmetric key (base64) that seals the group_state blob, with its version. */
  group_state_key: { key: string; version: number };
};

export type KeyKind = keyof KeyBodies;

export type KeyEnvelope = {
  [K in KeyKind]: EnvelopeBase & { kind: K; body: KeyBodies[K] };
}[KeyKind];

export const KEY_KINDS: readonly KeyKind[] = ["sender_key", "group_state_key"];

export function isKeyKind(kind: string): kind is KeyKind {
  return (KEY_KINDS as readonly string[]).includes(kind);
}

/** The decrypted body of a message envelope (spec 5.1 / 6.2). */
export type PlainEnvelope = TextEnvelope | ControlEnvelope | KeyEnvelope;

export const CONTROL_KINDS: readonly ControlKind[] = [
  "reaction",
  "edit",
  "delete",
  "receipt",
  "read",
  "audio_play",
  "pin",
];

export function isControlKind(kind: string): kind is ControlKind {
  return (CONTROL_KINDS as readonly string[]).includes(kind);
}

export function isControlEnvelope(p: PlainEnvelope): p is ControlEnvelope {
  return p.kind !== "text" && !isKeyKind(p.kind);
}

export function isKeyEnvelope(p: PlainEnvelope): p is KeyEnvelope {
  return isKeyKind(p.kind);
}

const MAX_IDS = 500;
const MAX_EMOJI = 32;
const MAX_EDIT_BODY = 20_000;

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function parseControlBody(kind: ControlKind, b: unknown): ControlBodies[ControlKind] | null {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  switch (kind) {
    case "reaction":
      if (!str(o.messageId) || !str(o.emoji) || o.emoji.length > MAX_EMOJI) return null;
      if (o.remove !== undefined && typeof o.remove !== "boolean") return null;
      return { messageId: o.messageId, emoji: o.emoji, remove: o.remove === true };
    case "edit":
      if (!str(o.messageId) || typeof o.body !== "string" || o.body.length > MAX_EDIT_BODY) {
        return null;
      }
      return { messageId: o.messageId, body: o.body };
    case "receipt":
    case "read":
      if (
        !Array.isArray(o.messageIds) ||
        o.messageIds.length === 0 ||
        o.messageIds.length > MAX_IDS ||
        !o.messageIds.every(str)
      ) {
        return null;
      }
      return { messageIds: [...new Set(o.messageIds as string[])] };
    case "pin":
      if (!str(o.messageId) || typeof o.pinned !== "boolean") return null;
      return { messageId: o.messageId, pinned: o.pinned };
    case "delete":
    case "audio_play":
      if (!str(o.messageId)) return null;
      return { messageId: o.messageId };
  }
}

/** Mailbox envelope `kind` for an Olm-encrypted message (type 0/1 is inside the payload). */
export const ENCRYPTED_ENVELOPE_KIND = 2;
/** Mailbox envelope `kind` for a Megolm group message (payload {s: sessionId, c: ciphertext}). */
export const GROUP_ENVELOPE_KIND = 3;

export function encodeGroupPayload(m: { sessionId: string; ciphertext: string }): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ s: m.sessionId, c: m.ciphertext }));
}

export function decodeGroupPayload(
  payload: Uint8Array,
): { sessionId: string; ciphertext: string } | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(payload)) as { s?: unknown; c?: unknown };
    if (typeof o.s !== "string" || !o.s || typeof o.c !== "string" || !o.c) return null;
    return { sessionId: o.s, ciphertext: o.c };
  } catch {
    return null;
  }
}

export function encodePlainEnvelope(p: PlainEnvelope): string {
  return padPlaintext(JSON.stringify(p));
}

/** Strictly parses a decrypted body; returns null for anything malformed or unknown. */
export function decodePlainEnvelope(text: string): PlainEnvelope | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (
    o.v !== 1 ||
    typeof o.kind !== "string" ||
    !str(o.id) ||
    !str(o.conversationId) ||
    typeof o.sentAt !== "string" ||
    Number.isNaN(Date.parse(o.sentAt))
  ) {
    return null;
  }
  const base = { v: 1 as const, id: o.id, conversationId: o.conversationId, sentAt: o.sentAt };
  if (o.kind === "text") {
    if (typeof o.body !== "string") return null;
    if (o.replyToId !== undefined && o.replyToId !== null && typeof o.replyToId !== "string") {
      return null;
    }
    return { ...base, kind: "text", body: o.body, replyToId: (o.replyToId as string | null) ?? null };
  }
  if (isKeyKind(o.kind)) {
    const b = o.body as Record<string, unknown> | null;
    if (!b || typeof b !== "object" || Array.isArray(b)) return null;
    if (o.kind === "sender_key") {
      if (!str(b.sessionId) || !str(b.sessionKey)) return null;
      return { ...base, kind: "sender_key", body: { sessionId: b.sessionId, sessionKey: b.sessionKey } };
    }
    if (!str(b.key) || typeof b.version !== "number" || !Number.isInteger(b.version) || b.version < 1) {
      return null;
    }
    return { ...base, kind: "group_state_key", body: { key: b.key, version: b.version } };
  }
  if (!isControlKind(o.kind)) return null;
  const body = parseControlBody(o.kind, o.body);
  if (!body) return null;
  return { ...base, kind: o.kind, body } as ControlEnvelope;
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
