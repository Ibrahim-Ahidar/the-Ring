import { callRpc, type RpcClient } from "@/platform/rpc";
import { ok, type Result } from "@/platform/result";

import type { MessageRequest, RequestStatus } from "./types";

type DbRow = {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  username: string;
  display_name: string | null;
  note: string | null;
  status: RequestStatus;
  conversation_id: string | null;
  created_at: string;
};

function mapRow(row: DbRow): MessageRequest {
  return {
    id: row.id,
    userId: (row.from_user_id ?? row.to_user_id) as string,
    username: row.username,
    displayName: row.display_name,
    note: row.note,
    status: row.status,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  };
}

export async function createRequest(
  rpc: RpcClient,
  input: { username: string; note?: string | null },
): Promise<Result<{ id: string }>> {
  const result = await callRpc<{ id: string }>(rpc, "create_message_request", {
    p_username: input.username,
    p_note: input.note?.trim() ? input.note.trim() : null,
  });
  return result.ok ? ok({ id: result.value.id }) : result;
}

export async function listIncoming(rpc: RpcClient): Promise<Result<MessageRequest[]>> {
  const result = await callRpc<DbRow[] | null>(rpc, "list_incoming_message_requests");
  return result.ok ? ok((result.value ?? []).map(mapRow)) : result;
}

export async function listOutgoing(rpc: RpcClient): Promise<Result<MessageRequest[]>> {
  const result = await callRpc<DbRow[] | null>(rpc, "list_outgoing_message_requests");
  return result.ok ? ok((result.value ?? []).map(mapRow)) : result;
}

export async function acceptRequest(
  rpc: RpcClient,
  requestId: string,
): Promise<Result<{ conversationId: string }>> {
  const result = await callRpc<{ conversation_id: string }>(rpc, "accept_message_request", {
    p_request_id: requestId,
  });
  return result.ok ? ok({ conversationId: result.value.conversation_id }) : result;
}

export async function declineRequest(rpc: RpcClient, requestId: string): Promise<Result<void>> {
  const result = await callRpc<unknown>(rpc, "decline_message_request", {
    p_request_id: requestId,
  });
  return result.ok ? ok(undefined) : result;
}
