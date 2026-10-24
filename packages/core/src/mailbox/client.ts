import { callRpc, type RpcClient } from "../rpc";
import { ok, type Result } from "../result";
import { bytesToBase64, fromWire } from "./codec";
import {
  MAILBOX_PAGE_SIZE,
  type MailboxEnvelope,
  type OutgoingEnvelope,
  type SendResult,
  type WireEnvelope,
} from "./types";

export const MAX_BATCH = 100;

/** Sends envelopes, in batches of at most 100, and returns one result per envelope. */
export async function sendEnvelopes(
  client: RpcClient,
  envelopes: OutgoingEnvelope[],
): Promise<Result<SendResult[]>> {
  const results: SendResult[] = [];
  for (let i = 0; i < envelopes.length; i += MAX_BATCH) {
    const batch = envelopes.slice(i, i + MAX_BATCH).map((e) => ({
      id: e.id,
      recipient_device_id: e.recipientDeviceId,
      sender_device_id: e.senderDeviceId,
      conversation_id: e.conversationId ?? null,
      kind: e.kind ?? 0,
      ciphertext: bytesToBase64(e.payload),
    }));
    const res = await callRpc<SendResult[]>(client, "send_envelopes", { p_batch: batch });
    if (!res.ok) return res;
    results.push(...res.value);
  }
  return ok(results);
}

export async function fetchMailboxPage(
  client: RpcClient,
  deviceId: string,
  after: number,
  limit = MAILBOX_PAGE_SIZE,
): Promise<Result<MailboxEnvelope[]>> {
  const res = await callRpc<WireEnvelope[] | null>(client, "fetch_mailbox", {
    p_device_id: deviceId,
    p_after: after,
    p_limit: limit,
  });
  if (!res.ok) return res;
  return ok((res.value ?? []).map(fromWire));
}

export async function ackEnvelopes(
  client: RpcClient,
  deviceId: string,
  ids: string[],
): Promise<Result<number>> {
  if (ids.length === 0) return ok(0);
  return callRpc<number>(client, "ack_envelopes", { p_device_id: deviceId, p_ids: ids });
}
