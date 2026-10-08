import type { ReportCategory } from "./types";

export type BlockDialogRequest = {
  userId: string;
  username: string;
  displayName: string | null;
};

export type ReportDialogRequest = {
  targetUserId?: string | null;
  targetMessageId?: string | null;
  subjectLabel?: string | null;
};

type SafetyDialogListener = (
  request: BlockDialogRequest | ReportDialogRequest,
  kind: "block" | "report",
) => void;

const listeners = new Set<SafetyDialogListener>();

export function requestBlockDialog(request: BlockDialogRequest): void {
  listeners.forEach((listener) => listener(request, "block"));
}

export function requestReportDialog(request: ReportDialogRequest): void {
  listeners.forEach((listener) => listener(request, "report"));
}

export function onSafetyDialogRequest(listener: SafetyDialogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  "spam",
  "harassment",
  "impersonation",
  "other",
];
