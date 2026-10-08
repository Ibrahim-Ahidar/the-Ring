"use server";

import { getSessionContext } from "@/platform/session";

import {
  blockUser,
  getPrivacy,
  listBlocks,
  listGroupReports,
  listMyReports,
  markReportReviewed,
  reportMessage,
  reportUser,
  unblockUser,
  updatePrivacy,
} from "./service";
import type { PrivacyPatch, ReportCategory } from "./types";

export async function fetchPrivacyAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return getPrivacy(session.rpc);
}

export async function updatePrivacyAction(patch: PrivacyPatch) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return updatePrivacy(session.rpc, patch);
}

export async function blockUserAction(blockedId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return blockUser(session.rpc, blockedId);
}

export async function unblockUserAction(blockedId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return unblockUser(session.rpc, blockedId);
}

export async function fetchBlocksAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listBlocks(session.rpc);
}

export async function reportUserAction(input: {
  targetUserId: string;
  category: ReportCategory;
  details?: string | null;
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return reportUser(session.rpc, input);
}

export async function reportMessageAction(input: {
  targetMessageId: string;
  category: ReportCategory;
  details?: string | null;
  targetUserId?: string | null;
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return reportMessage(session.rpc, input);
}

export async function fetchMyReportsAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listMyReports(session.rpc);
}

export async function fetchGroupReportsAction(conversationId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listGroupReports(session.rpc, conversationId);
}

export async function markReportReviewedAction(reportId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return markReportReviewed(session.rpc, reportId);
}
