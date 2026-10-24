import type { LocalStore, MessageRow } from "../local-store";
import type { MailboxEnvelope } from "../mailbox/types";
import type { OlmSessionManager } from "./olm-sessions";
import {
  ENCRYPTED_ENVELOPE_KIND,
  decodeOlmPayload,
  decodePlainEnvelope,
  type PlainEnvelope,
} from "./plain-envelope";

export type EncryptedHandlerOptions = {
  sessions: OlmSessionManager;
  store: Pick<LocalStore, "upsertMessages">;
  /** Called after a message was written, for UI refresh. */
  onMessage?(row: MessageRow): void;
  /** Called for an envelope that could not be decrypted or was malformed (dropped). */
  onRejected?(envelope: MailboxEnvelope, reason: string): void;
  now?: () => Date;
};

/** Maps a decrypted body to its local row. `sender_user_id` comes from the server envelope. */
export function plainToRow(
  p: PlainEnvelope,
  e: Pick<MailboxEnvelope, "senderUserId" | "senderDeviceId">,
  receivedAt: string,
): MessageRow {
  return {
    id: p.id,
    conversation_id: p.conversationId,
    sender_user_id: e.senderUserId,
    sender_device_id: e.senderDeviceId,
    sent_at: p.sentAt,
    received_at: receivedAt,
    kind: p.kind,
    body: p.body,
    reply_to_id: p.replyToId ?? null,
    edited_at: null,
    deleted: 0,
    status: "sent",
    media_json: JSON.stringify({ client_id: p.id }),
  };
}

/**
 * The mailbox receiver's handler for encrypted envelopes: decrypt, check, write to the local
 * store. A tampered or undecryptable envelope is dropped (reported, never thrown) so it
 * cannot block the drain; a storage failure does throw, so the row stays un-acked.
 */
export function createEncryptedEnvelopeHandler(
  opts: EncryptedHandlerOptions,
): (e: MailboxEnvelope) => Promise<void> {
  return async (e) => {
    const reject = (reason: string) => opts.onRejected?.(e, reason);
    if (e.kind !== ENCRYPTED_ENVELOPE_KIND || !e.senderDeviceId) return reject("e2ee.unsupported");
    const msg = decodeOlmPayload(e.payload);
    if (!msg) return reject("e2ee.malformed");
    let text: string;
    try {
      text = await opts.sessions.decryptFrom(e.senderDeviceId, msg);
    } catch {
      return reject("e2ee.decrypt_failed");
    }
    const plain = decodePlainEnvelope(text);
    if (!plain) return reject("e2ee.malformed");
    // The server-side envelope names the conversation; it must match the decrypted body.
    if (e.conversationId && e.conversationId !== plain.conversationId) {
      return reject("e2ee.mismatch");
    }
    const row = plainToRow(plain, e, (opts.now?.() ?? new Date()).toISOString());
    await opts.store.upsertMessages([row]);
    opts.onMessage?.(row);
  };
}
