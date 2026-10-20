import { mapMessageRow } from "@/features/direct-messaging/service";
import type { RpcMessageRow } from "@/features/direct-messaging/types";
import { callRpc, type RpcClient } from "@pulse/core/rpc";
import { err, ok, type Result } from "@pulse/core/result";
import type { TimelineMessage } from "@pulse/core/timeline";

function firstRow(
  value: RpcMessageRow[] | RpcMessageRow | null | undefined,
): RpcMessageRow | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function editMessage(
  rpc: RpcClient,
  input: { messageId: string; body: string },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "edit_message", {
    p_message_id: input.messageId,
    p_body: input.body,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}

export async function hideMessage(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "hide_message", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function deleteForEveryone(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "delete_for_everyone", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}

export async function forwardMessage(
  rpc: RpcClient,
  input: {
    sourceMessageId: string;
    targetConversationId: string;
    clientId: string;
  },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "forward_message", {
    p_source_message_id: input.sourceMessageId,
    p_target_conversation_id: input.targetConversationId,
    p_client_id: input.clientId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}

export async function pinMessage(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "pin_message", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}

export async function unpinMessage(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[]>(rpc, "unpin_message", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapMessageRow(row));
}
