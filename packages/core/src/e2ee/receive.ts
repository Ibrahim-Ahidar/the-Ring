import type { MessageRow } from "../local-store";
import type { MailboxEnvelope } from "../mailbox/types";
import type { OlmSessionManager } from "./olm-sessions";
import type { GroupSessionManager } from "./megolm-sessions";
import {
  ENCRYPTED_ENVELOPE_KIND,
  GROUP_ENVELOPE_KIND,
  decodeGroupPayload,
  decodeOlmPayload,
  decodePlainEnvelope,
  isControlEnvelope,
  isKeyEnvelope,
  type PlainEnvelope,
  type TextEnvelope,
} from "./plain-envelope";
import {
  applyControl,
  replayQueuedControls,
  type ControlOutcome,
  type ControlStore,
} from "./controls";

const MAX_EARLY_GROUP_MESSAGES = 500;

export type EncryptedHandlerOptions = {
  sessions: OlmSessionManager;
  store: ControlStore;
  /** Megolm sessions; without them group envelopes and `sender_key` are rejected. */
  groups?: GroupSessionManager;
  /** Receives a `group_state_key` from an Olm-authenticated Device. */
  onStateKey?(
    conversationId: string,
    key: string,
    version: number,
    senderDeviceId: string,
  ): Promise<void>;
  /**
   * True when `userId` is an owner or admin of the conversation (the put_group_state rule).
   * A `group_state_key` is accepted only from such a user; without this lookup it is dropped.
   */
  isConversationAdmin?(
    conversationId: string,
    userId: string,
  ): Promise<boolean>;
  /** Called when a group message arrived before its Megolm session key and was queued. */
  onQueued?(envelope: MailboxEnvelope): void;
  /** The signed-in user. Needed to tell my own Devices from the peer and to send receipts. */
  selfUserId?: string;
  /** Sends a control (used for the automatic delivery receipt); failures are swallowed. */
  sendControl?(
    conversationId: string,
    kind: "receipt",
    body: { messageIds: string[] },
  ): Promise<unknown>;
  /** Called after a control was applied, queued or dropped. */
  onControl?(p: PlainEnvelope, outcome: ControlOutcome): void;
  /** Called after a message was written, for UI refresh. */
  onMessage?(row: MessageRow): void;
  /** Called for an envelope that could not be decrypted or was malformed (dropped). */
  onRejected?(envelope: MailboxEnvelope, reason: string): void;
  now?: () => Date;
};

/** Maps a decrypted body to its local row. `sender_user_id` comes from the server envelope. */
export function plainToRow(
  p: TextEnvelope,
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
  // Group messages whose Megolm sender_key has not arrived yet, by Device + conversation +
  // session. In memory and bounded: a lost entry only costs a message the server redelivers.
  const early = new Map<string, MailboxEnvelope[]>();
  let earlyCount = 0;
  const earlyKey = (d: string, c: string, s: string) => `${d}|${c}|${s}`;
  const handle = async (e: MailboxEnvelope): Promise<void> => {
    const reject = (reason: string) => opts.onRejected?.(e, reason);
    if (!e.senderDeviceId) return reject("e2ee.unsupported");
    let text: string;
    let viaGroup = false;
    if (e.kind === GROUP_ENVELOPE_KIND) {
      if (!opts.groups || !e.conversationId) return reject("e2ee.unsupported");
      const g = decodeGroupPayload(e.payload);
      if (!g) return reject("e2ee.malformed");
      try {
        text = await opts.groups.decrypt(
          e.senderDeviceId,
          e.conversationId,
          g.sessionId,
          g.ciphertext,
        );
      } catch (err) {
        const m = err instanceof Error ? err.message : "";
        if (
          m === "e2ee.no_group_key" &&
          earlyCount < MAX_EARLY_GROUP_MESSAGES
        ) {
          const k = earlyKey(e.senderDeviceId, e.conversationId, g.sessionId);
          const q = early.get(k) ?? [];
          if (!q.some((x) => x.id === e.id)) {
            q.push(e);
            earlyCount++;
          }
          early.set(k, q);
          opts.onQueued?.(e);
          return;
        }
        return reject(
          m === "e2ee.no_group_key" || m === "e2ee.mismatch"
            ? m
            : "e2ee.decrypt_failed",
        );
      }
      viaGroup = true;
    } else if (e.kind === ENCRYPTED_ENVELOPE_KIND) {
      const msg = decodeOlmPayload(e.payload);
      if (!msg) return reject("e2ee.malformed");
      try {
        text = await opts.sessions.decryptFrom(e.senderDeviceId, msg);
      } catch {
        return reject("e2ee.decrypt_failed");
      }
    } else {
      return reject("e2ee.unsupported");
    }
    const plain = decodePlainEnvelope(text);
    if (!plain) return reject("e2ee.malformed");
    // Key material only ever arrives inside an Olm envelope, never inside a group message.
    if (isKeyEnvelope(plain)) {
      if (viaGroup) return reject("e2ee.malformed");
      if (plain.kind === "sender_key") {
        const okKey = await opts.groups?.acceptSenderKey(
          e.senderDeviceId,
          plain.conversationId,
          plain.body.sessionId,
          plain.body.sessionKey,
        );
        if (!okKey) return reject("e2ee.bad_key");
        const k = earlyKey(
          e.senderDeviceId,
          plain.conversationId,
          plain.body.sessionId,
        );
        const waiting = early.get(k);
        if (waiting) {
          early.delete(k);
          earlyCount -= waiting.length;
          for (const w of waiting) await handle(w);
        }
      } else {
        if (
          !e.senderUserId ||
          !opts.isConversationAdmin ||
          !(await opts.isConversationAdmin(
            plain.conversationId,
            e.senderUserId,
          ))
        ) {
          return reject("e2ee.not_admin");
        }
        await opts.onStateKey?.(
          plain.conversationId,
          plain.body.key,
          plain.body.version,
          e.senderDeviceId,
        );
      }
      return;
    }
    // The server-side envelope names the conversation; it must match the decrypted body.
    if (e.conversationId && e.conversationId !== plain.conversationId) {
      return reject("e2ee.mismatch");
    }
    const store = opts.store;
    const selfUserId = opts.selfUserId ?? "";
    if (isControlEnvelope(plain)) {
      const outcome = await applyControl(store, plain, {
        selfUserId,
        senderUserId: e.senderUserId ?? null,
      });
      opts.onControl?.(plain, outcome);
      return;
    }
    // A redelivered text must not overwrite a row that was since edited or deleted.
    if (await store.getMessage(plain.id)) return;
    const row = plainToRow(
      plain,
      e,
      (opts.now?.() ?? new Date()).toISOString(),
    );
    await store.upsertMessages([row]);
    await replayQueuedControls(store, plain.id, selfUserId);
    opts.onMessage?.(row);
    if (
      opts.sendControl &&
      selfUserId &&
      e.senderUserId &&
      e.senderUserId !== selfUserId
    ) {
      try {
        await opts.sendControl(plain.conversationId, "receipt", {
          messageIds: [plain.id],
        });
      } catch {
        // a lost receipt only delays the double tick; never fail the drain for it
      }
    }
  };
  return handle;
}
