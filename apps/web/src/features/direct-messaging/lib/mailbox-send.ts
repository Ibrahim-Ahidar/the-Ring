import { sendEncrypted } from "@pulse/core/e2ee/encrypted-sender";
import type { MediaEnvelope, TextEnvelope } from "@pulse/core/e2ee/plain-envelope";
import type { OlmSessionManager } from "@pulse/core/e2ee/olm-sessions";
import type { RpcMessageRow } from "@pulse/core/messaging-types";
import type { RpcClient } from "@pulse/core/rpc";
import type { Result } from "@pulse/core/result";
import { ok } from "@pulse/core/result";

import type { TextPayload } from "./text-outbox";

/** The plaintext envelope of an outbox payload: a media envelope when a file was uploaded. */
export function buildEnvelope(input: TextPayload, sentAt: string): TextEnvelope | MediaEnvelope {
  if (input.media) {
    return {
      v: 1,
      id: input.clientId,
      conversationId: input.conversationId,
      sentAt,
      kind: "media",
      body: input.media,
    };
  }
  return {
    v: 1,
    id: input.clientId,
    conversationId: input.conversationId,
    sentAt,
    kind: "text",
    body: input.body,
    ...(input.replyToId ? { replyToId: input.replyToId } : {}),
  };
}

/**
 * Sends a text as Olm ciphertext through the mailbox: one envelope per recipient Device (the
 * other members' Devices and the sender's own other Devices). The mailbox never sees
 * plaintext. Each mailbox id is derived from the outbox client id and the Device, so a
 * resend is deduped server-side.
 */
export function createEncryptedTextSender(args: {
  client: RpcClient;
  sessions: OlmSessionManager;
  userId: string;
  deviceId?: string;
  now?: () => Date;
}): (input: TextPayload) => Promise<Result<RpcMessageRow>> {
  return async (input) => {
    const now = (args.now ?? (() => new Date()))().toISOString();
    const sent = await sendEncrypted({
      client: args.client,
      sessions: args.sessions,
      userId: args.userId,
      deviceId: args.deviceId,
      deriveId: derivedId,
      body: buildEnvelope(input, now),
    });
    if (!sent.ok) return sent;
    return ok({
      id: input.clientId,
      conversation_id: input.conversationId,
      sender_id: args.userId,
      client_id: input.clientId,
      type: "text",
      body: input.media ? (input.media.caption ?? null) : input.body,
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
