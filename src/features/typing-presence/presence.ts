import type { InteractionDecision } from "@/platform/interaction";

import { callRpc, type RpcClient } from "@/platform/rpc";
import { ok, type Result } from "@/platform/result";

export const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000;

export type PresenceVisibility = {
  showOnline: boolean;
  showLastSeen: boolean;
};

export function canShowPresence(
  decision: InteractionDecision,
  showLastSeen: boolean,
): PresenceVisibility {
  const allowed = decision === "allow";
  return {
    showOnline: allowed,
    showLastSeen: allowed && showLastSeen,
  };
}

export type SubjectPresenceRow = {
  display_name: string;
  last_seen_at: string | null;
  presence_allowed: boolean;
  show_last_seen: boolean;
  last_seen_visible: boolean;
};

let lastTouchAtMs: number | null = null;

/** Client-side throttle before calling the RPC (5-minute window). */
export function shouldTouchLastSeen(nowMs: number): boolean {
  if (lastTouchAtMs === null) {
    return true;
  }
  return nowMs - lastTouchAtMs >= LAST_SEEN_TOUCH_MS;
}

export function markLastSeenTouched(nowMs: number): void {
  lastTouchAtMs = nowMs;
}

export function resetLastSeenTouchForTests(): void {
  lastTouchAtMs = null;
}

export async function touchLastSeen(
  rpc: RpcClient,
  nowMs: number = Date.now(),
): Promise<Result<boolean>> {
  if (!shouldTouchLastSeen(nowMs)) {
    return ok(false);
  }

  const result = await callRpc<boolean>(rpc, "typing_presence_touch_last_seen", {
    p_now: new Date(nowMs).toISOString(),
  });

  if (result.ok && result.value) {
    markLastSeenTouched(nowMs);
  }

  return result;
}

export async function readSubjectPresence(
  rpc: RpcClient,
  conversationId: string,
  subjectId: string,
): Promise<Result<SubjectPresenceRow | null>> {
  const result = await callRpc<SubjectPresenceRow[]>(
    rpc,
    "typing_presence_read_subject",
    {
      p_conversation_id: conversationId,
      p_subject_id: subjectId,
    },
  );

  if (!result.ok) {
    return result;
  }

  const row = result.value[0] ?? null;
  return ok(row);
}
