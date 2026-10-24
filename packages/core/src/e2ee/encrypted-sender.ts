import { sendEnvelopes } from "../mailbox/client";
import type { OutgoingEnvelope, SendResult } from "../mailbox/types";
import { callRpc, type RpcClient } from "../rpc";
import { err, ok, type Result } from "../result";
import type { ClaimedKey, OlmSessionManager } from "./olm-sessions";
import {
  ENCRYPTED_ENVELOPE_KIND,
  encodeOlmPayload,
  encodePlainEnvelope,
  type ControlBodies,
  type ControlEnvelope,
  type ControlKind,
  type PlainEnvelope,
} from "./plain-envelope";

type RecipientRow = { user_id: string; device_id: string; is_current_session: boolean };
type ClaimRow = { device_id: string; identity_key: string; key_id: string; public_key: string };

/** claim_keys over RPC, shaped for the session manager. */
export async function claimKeysRpc(
  client: RpcClient,
  deviceIds: string[],
): Promise<Result<ClaimedKey[]>> {
  const res = await callRpc<ClaimRow[] | null>(client, "claim_keys", { p_device_ids: deviceIds });
  if (!res.ok) return res;
  return ok(
    (res.value ?? []).map((r) => ({
      deviceId: r.device_id,
      identityKey: r.identity_key,
      oneTimeKey: r.public_key,
    })),
  );
}

/**
 * Sends one Olm-encrypted envelope per recipient Device (the other members' Devices and the
 * sender's own other Devices). The mailbox only ever sees ciphertext; ids are derived from
 * the message id and Device so a resend is deduped by the server.
 */
export async function sendEncrypted(args: {
  client: RpcClient;
  sessions: OlmSessionManager;
  userId: string;
  /** This Device's id; when absent the server's current-session Device is used. */
  deviceId?: string;
  body: PlainEnvelope;
  deriveId(messageId: string, deviceId: string): string;
}): Promise<Result<SendResult[]>> {
  const rec = await callRpc<RecipientRow[]>(args.client, "mailbox_recipients", {
    p_conversation_id: args.body.conversationId,
  });
  if (!rec.ok) return rec;
  const meId =
    args.deviceId ??
    (
      rec.value.find((r) => r.is_current_session) ??
      rec.value.find((r) => r.user_id === args.userId)
    )?.device_id;
  if (!meId) return err("e2ee.device_not_found");
  const targets = rec.value.filter((r) => r.device_id !== meId).map((r) => r.device_id);
  if (targets.length === 0) return ok([]);

  const enc = await args.sessions.encryptForDevices(encodePlainEnvelope(args.body), targets);
  if (!enc.ok) return enc;
  const envelopes: OutgoingEnvelope[] = [];
  for (const [deviceId, msg] of enc.value) {
    envelopes.push({
      id: args.deriveId(args.body.id, deviceId),
      recipientDeviceId: deviceId,
      senderDeviceId: meId,
      conversationId: args.body.conversationId,
      kind: ENCRYPTED_ENVELOPE_KIND,
      payload: encodeOlmPayload(msg),
    });
  }
  if (envelopes.length === 0) return err("messaging.forbidden");
  const sent = await sendEnvelopes(args.client, envelopes);
  if (!sent.ok) return sent;
  if (sent.value.length > 0 && sent.value.every((s) => s.status === "forbidden")) {
    return err("messaging.forbidden");
  }
  return sent;
}

/**
 * `sendControl(conversationId, kind, body)`: wraps a Control Message in a fresh envelope and
 * fans it out exactly like a text (peer Devices plus my own other Devices).
 */
export function createControlSender(args: {
  client: RpcClient;
  sessions: OlmSessionManager;
  userId: string;
  deviceId?: string;
  deriveId(messageId: string, deviceId: string): string;
  newId(): string;
  now?: () => Date;
}) {
  return async function sendControl<K extends ControlKind>(
    conversationId: string,
    kind: K,
    body: ControlBodies[K],
  ): Promise<Result<SendResult[]>> {
    const envelope = {
      v: 1,
      id: args.newId(),
      conversationId,
      sentAt: (args.now?.() ?? new Date()).toISOString(),
      kind,
      body,
    } as ControlEnvelope;
    return sendEncrypted({
      client: args.client,
      sessions: args.sessions,
      userId: args.userId,
      deviceId: args.deviceId,
      body: envelope,
      deriveId: args.deriveId,
    });
  };
}
