/**
 * Server-only: pass an RpcClient backed by the Supabase service role (admin).
 * Browser clients cannot execute the notify RPC.
 */

import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

export type NotifyInput = {
  recipientId: string;
  type: string;
  actorId: string;
  entityId: string;
  conversationId?: string | null;
  mention?: boolean;
};

export type NotifyOutcome =
  | "notifications.created"
  | "notifications.skipped_disabled"
  | "notifications.skipped_muted";

export async function notify(
  client: RpcClient,
  input: NotifyInput,
): Promise<Result<NotifyOutcome>> {
  const result = await callRpc<string>(client, "notify", {
    p_recipient_id: input.recipientId,
    p_type: input.type,
    p_actor_id: input.actorId,
    p_entity_id: input.entityId,
    p_conversation_id: input.conversationId ?? null,
    p_mention: input.mention ?? false,
  });

  if (!result.ok) {
    return result;
  }

  const outcome = result.value;
  if (outcome === "notifications.recipient_missing") {
    return err("notifications.recipient_missing");
  }
  if (
    outcome === "notifications.created" ||
    outcome === "notifications.skipped_disabled" ||
    outcome === "notifications.skipped_muted"
  ) {
    return ok(outcome);
  }

  return err("platform.unexpected");
}
