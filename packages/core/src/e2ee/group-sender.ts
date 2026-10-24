import { sendEnvelopes } from "../mailbox/client";
import type { OutgoingEnvelope, SendResult } from "../mailbox/types";
import { callRpc, type RpcClient } from "../rpc";
import { err, ok, type Result } from "../result";
import type { GroupStateManager } from "./group-state";
import { MAX_GROUP_MEMBERS, type GroupSessionManager } from "./megolm-sessions";
import type { OlmSessionManager } from "./olm-sessions";
import {
  ENCRYPTED_ENVELOPE_KIND,
  GROUP_ENVELOPE_KIND,
  encodeGroupPayload,
  encodeOlmPayload,
  encodePlainEnvelope,
  type KeyBodies,
  type KeyEnvelope,
  type KeyKind,
  type PlainEnvelope,
} from "./plain-envelope";

type RecipientRow = { user_id: string; device_id: string; is_current_session: boolean };
type KeyPart = { [K in KeyKind]: { kind: K; body: KeyBodies[K] } }[KeyKind];

export type GroupSenderArgs = {
  client: RpcClient;
  sessions: OlmSessionManager;
  groups: GroupSessionManager;
  /** When set, the group_state key rides along with every new Device's sender_key. */
  state?: GroupStateManager;
  userId: string;
  deviceId?: string;
  deriveId(messageId: string, deviceId: string): string;
  newId(): string;
  now?: () => Date;
};

/**
 * Sends a text or control to a group: shares the Megolm session key (Olm, one row per
 * Device) with Devices that lack it, then fans the single Megolm ciphertext out one row per
 * recipient Device. Refuses a group of more than 256 members.
 */
export function createGroupSender(args: GroupSenderArgs) {
  async function roster(
    conversationId: string,
  ): Promise<Result<{ meId: string; targets: string[] }>> {
    const rec = await callRpc<RecipientRow[]>(args.client, "mailbox_recipients", {
      p_conversation_id: conversationId,
    });
    if (!rec.ok) return rec;
    const meId =
      args.deviceId ??
      (
        rec.value.find((r) => r.is_current_session) ??
        rec.value.find((r) => r.user_id === args.userId)
      )?.device_id;
    if (!meId) return err("e2ee.device_not_found");
    if (new Set(rec.value.map((r) => r.user_id)).size > MAX_GROUP_MEMBERS) {
      return err("groups.member_limit");
    }
    return ok({
      meId,
      targets: rec.value.filter((r) => r.device_id !== meId).map((r) => r.device_id),
    });
  }

  /** Olm-encrypts each key message to the Devices; returns the Devices a sender_key reached. */
  async function sendKeys(
    conversationId: string,
    meId: string,
    deviceIds: string[],
    keys: KeyPart[],
  ): Promise<Result<string[]>> {
    const delivered: string[] = [];
    for (const k of keys) {
      const id = args.newId();
      const env = {
        v: 1,
        id,
        conversationId,
        sentAt: (args.now?.() ?? new Date()).toISOString(),
        ...k,
      } as KeyEnvelope;
      const enc = await args.sessions.encryptForDevices(encodePlainEnvelope(env), deviceIds);
      if (!enc.ok) return enc;
      const rows: OutgoingEnvelope[] = [];
      for (const [deviceId, msg] of enc.value) {
        rows.push({
          id: args.deriveId(id, deviceId),
          recipientDeviceId: deviceId,
          senderDeviceId: meId,
          conversationId,
          kind: ENCRYPTED_ENVELOPE_KIND,
          payload: encodeOlmPayload(msg),
        });
      }
      if (rows.length === 0) return err("messaging.forbidden");
      const sent = await sendEnvelopes(args.client, rows);
      if (!sent.ok) return sent;
      if (k.kind === "sender_key") {
        const ok2 = new Set(sent.value.filter((s) => s.status !== "forbidden").map((s) => s.id));
        delivered.push(...rows.filter((r) => ok2.has(r.id)).map((r) => r.recipientDeviceId));
      }
    }
    return ok(delivered);
  }

  return {
    /** Sends `body` (text or control) to the group. */
    async send(body: Exclude<PlainEnvelope, KeyEnvelope>): Promise<Result<SendResult[]>> {
      const r = await roster(body.conversationId);
      if (!r.ok) return r;
      const { meId, targets } = r.value;
      if (targets.length === 0) return ok([]);
      const plan = await args.groups.prepareSend(body.conversationId, targets);
      if (plan.shareWith.length > 0) {
        const keys: KeyPart[] = [
          { kind: "sender_key", body: { sessionId: plan.sessionId, sessionKey: plan.sessionKey } },
        ];
        if (args.state) {
          const k = await args.state.currentKey(body.conversationId);
          keys.push({ kind: "group_state_key", body: { key: k.key, version: k.version } });
        }
        const shared = await sendKeys(body.conversationId, meId, plan.shareWith, keys);
        if (!shared.ok) return shared;
        await args.groups.markShared(body.conversationId, plan.sessionId, shared.value);
      }
      const enc = await args.groups.encrypt(body.conversationId, encodePlainEnvelope(body));
      const payload = encodeGroupPayload(enc);
      const rows: OutgoingEnvelope[] = targets.map((deviceId) => ({
        id: args.deriveId(body.id, deviceId),
        recipientDeviceId: deviceId,
        senderDeviceId: meId,
        conversationId: body.conversationId,
        kind: GROUP_ENVELOPE_KIND,
        payload,
      }));
      const sent = await sendEnvelopes(args.client, rows);
      if (!sent.ok) return sent;
      if (sent.value.length > 0 && sent.value.every((s) => s.status === "forbidden")) {
        return err("messaging.forbidden");
      }
      return sent;
    },

    /** Pushes the group_state key to every other Device (after publish or a key rotation). */
    async shareStateKey(conversationId: string): Promise<Result<true>> {
      if (!args.state) return err("e2ee.unsupported");
      const r = await roster(conversationId);
      if (!r.ok) return r;
      if (r.value.targets.length === 0) return ok(true);
      const k = await args.state.currentKey(conversationId);
      const res = await sendKeys(conversationId, r.value.meId, r.value.targets, [
        { kind: "group_state_key", body: { key: k.key, version: k.version } },
      ]);
      return res.ok ? ok(true) : res;
    },
  };
}
