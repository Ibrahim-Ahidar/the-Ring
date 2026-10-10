import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import {
  mapIncoming,
  mapOutgoing,
  mapRequestRow,
  type IncomingMessageRequest,
  type MessageRequestRow,
  type OutgoingMessageRequest,
} from "./types";

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

export async function createRequest(
  rpc: RpcClient,
  input: { username: string; note?: string | null },
): Promise<
  Result<{
    id: string;
    fromUserId: string;
    toUserId: string;
    conversationId: string | null;
    status: string;
    note: string | null;
    createdAt: string;
  }>
> {
  const result = await callRpc<MessageRequestRow>(rpc, "create_message_request", {
    p_username: input.username,
    p_note: input.note ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row?.id) {
    return err("platform.unexpected");
  }
  return ok(mapRequestRow(row));
}

export async function listIncoming(
  rpc: RpcClient,
): Promise<Result<IncomingMessageRequest[]>> {
  const result = await callRpc<IncomingMessageRequest[]>(
    rpc,
    "list_incoming_message_requests",
    {},
  );
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  return ok(rows.map((row) => mapIncoming(row as never)));
}

export async function listOutgoing(
  rpc: RpcClient,
): Promise<Result<OutgoingMessageRequest[]>> {
  const result = await callRpc<OutgoingMessageRequest[]>(
    rpc,
    "list_outgoing_message_requests",
    {},
  );
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  return ok(rows.map((row) => mapOutgoing(row as never)));
}

export async function countPendingIncoming(rpc: RpcClient): Promise<Result<number>> {
  const result = await callRpc<number>(rpc, "count_pending_incoming_message_requests", {});
  if (!result.ok) {
    return result;
  }
  return ok(Number(result.value ?? 0));
}

export async function acceptRequest(
  rpc: RpcClient,
  requestId: string,
): Promise<Result<{ requestId: string; conversationId: string; status: string }>> {
  const result = await callRpc<{
    request_id: string;
    conversation_id: string;
    status: string;
  }>(rpc, "accept_message_request", {
    p_request_id: requestId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row?.conversation_id) {
    return err("platform.unexpected");
  }
  return ok({
    requestId: row.request_id,
    conversationId: row.conversation_id,
    status: row.status,
  });
}

export async function declineRequest(
  rpc: RpcClient,
  requestId: string,
): Promise<Result<{ requestId: string; status: string }>> {
  const result = await callRpc<{ request_id: string; status: string }>(
    rpc,
    "decline_message_request",
    {
      p_request_id: requestId,
    },
  );
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok({
    requestId: row.request_id,
    status: row.status,
  });
}
