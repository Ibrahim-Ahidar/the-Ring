import type { TimelineMessage } from "@pulse/core/timeline";

export type UploadPhase = "pending" | "ready" | "failed" | null;

export function uploadPhase(message: TimelineMessage): UploadPhase {
  const raw = message.metadata?.upload;
  if (raw === "pending" || raw === "ready" || raw === "failed") {
    return raw;
  }
  return message.type === "text" ? null : "ready";
}

export function shouldHideMessageForViewer(
  message: TimelineMessage,
  viewerId: string,
): boolean {
  const phase = uploadPhase(message);
  if (phase === "pending" || phase === "failed") {
    return message.sender_id !== viewerId;
  }
  return false;
}
