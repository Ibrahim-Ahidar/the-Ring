import { callRpc, type RpcClient } from "@pulse/core/rpc";
import type { Result } from "@pulse/core/result";

import {
  readSubjectPresence,
  touchLastSeen,
  type SubjectPresenceRow,
} from "@/features/typing-presence/presence";

export async function touchLastSeenForMember(
  rpc: RpcClient,
  nowMs?: number,
): Promise<Result<boolean>> {
  return touchLastSeen(rpc, nowMs);
}

export async function fetchSubjectPresence(
  rpc: RpcClient,
  conversationId: string,
  subjectId: string,
): Promise<Result<SubjectPresenceRow | null>> {
  return readSubjectPresence(rpc, conversationId, subjectId);
}

/** Heartbeat-based online check; the server applies the presence privacy gate. */
export async function fetchPeerOnline(
  rpc: RpcClient,
  subjectId: string,
): Promise<Result<boolean>> {
  return callRpc<boolean>(rpc, "presence_peer_online", {
    p_subject_id: subjectId,
  });
}
