import type { RpcClient } from "@/platform/rpc";
import type { Result } from "@/platform/result";

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
