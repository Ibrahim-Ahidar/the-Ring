import { decodePlaintext, encodePlaintext } from "@pulse/core/mailbox/codec";
import { sendEnvelopes } from "@pulse/core/mailbox/client";
import type { OutgoingEnvelope } from "@pulse/core/mailbox/types";
import type { RpcMessageRow } from "@pulse/core/messaging-types";
import { callRpc, type RpcClient } from "@pulse/core/rpc";
import { err, ok, type Result } from "@pulse/core/result";

import type { TextPayload } from "./text-outbox";

export const TEXT_ENVELOPE_KIND = 1;

/** The plaintext body of a text envelope. Becomes the encrypted body once #226+ land. */
export type TextEnvelopeBody = {
  v: 1;
  type: "text";
  client_id: string;
  conversation_id: string;
  body: string;
  reply_to_id: string | null;
  sent_at: string;
};

export function decodeTextEnvelope(payload: Uint8Array): TextEnvelopeBody {
  return decodePlaintext<TextEnvelopeBody>(payload);
}

type RecipientRow = { user_id: string; device_id: string; is_current_session: boolean };

/**
 * Sends a text through the mailbox: one envelope per recipient device (the other members'
 * devices and the sender's own other devices). Each mailbox id is derived from the outbox
 * client id and the device, so a resend is deduped server-side.
 */
export function createMailboxTextSender(args: {
  client: RpcClient;
  userId: string;
  now?: () => Date;
}): (input: TextPayload) => Promise<Result<RpcMessageRow>> {
  return async (input) => {
    const now = (args.now ?? (() => new Date()))().toISOString();
    const rec = await callRpc<RecipientRow[]>(args.client, "mailbox_recipients", {
      p_conversation_id: input.conversationId,
    });
    if (!rec.ok) return rec;
    const sender = rec.value.find((r) => r.is_current_session) ?? rec.value.find((r) => r.user_id === args.userId);
    if (!sender) return err("e2ee.device_not_found");

    const body: TextEnvelopeBody = {
      v: 1,
      type: "text",
      client_id: input.clientId,
      conversation_id: input.conversationId,
      body: input.body,
      reply_to_id: input.replyToId ?? null,
      sent_at: now,
    };
    const payload = encodePlaintext(body);
    const targets = rec.value.filter((r) => r.device_id !== sender.device_id);
    const envelopes: OutgoingEnvelope[] = [];
    for (const t of targets) {
      envelopes.push({
        // Deterministic per (client id, device): a resend dedups instead of duplicating.
        id: derivedId(input.clientId, t.device_id),
        recipientDeviceId: t.device_id,
        senderDeviceId: sender.device_id,
        conversationId: input.conversationId,
        kind: TEXT_ENVELOPE_KIND,
        payload,
      });
    }
    if (envelopes.length > 0) {
      const sent = await sendEnvelopes(args.client, envelopes);
      if (!sent.ok) return sent;
      const failed = sent.value.find((s) => s.status === "forbidden");
      if (failed && sent.value.every((s) => s.status === "forbidden")) {
        return err("messaging.forbidden");
      }
    }
    return ok({
      id: input.clientId,
      conversation_id: input.conversationId,
      sender_id: args.userId,
      client_id: input.clientId,
      type: "text",
      body: input.body,
      reply_to_id: input.replyToId ?? null,
      created_at: now,
      edited_at: null,
      deleted_at: null,
      deletion_scope: null,
      pinned_at: null,
      forwarded: false,
      metadata: null,
    } as unknown as RpcMessageRow);
  };
}

/** A stable UUID-shaped id from a client id and a device id (no crypto: layout only). */
export function derivedId(clientId: string, deviceId: string): string {
  // XOR-fold so both inputs influence every position.
  const a = clientId.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  const b = deviceId.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += ((parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)) & 0xf).toString(16);
  }
  const v = out.slice(0, 12) + "4" + out.slice(13, 16) + "8" + out.slice(17);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
