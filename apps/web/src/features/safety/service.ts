import { decideInteraction } from "@/platform/interaction";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import type {
  BlockRow,
  GroupReportRow,
  PrivacyPatch,
  PrivacySettings,
  ReportCategory,
  ReportRow,
} from "./types";

type DbPrivacyRow = {
  discoverable: boolean;
  profile_visibility: PrivacySettings["profileVisibility"];
  show_last_seen: boolean;
  show_online: boolean;
  send_read_receipts: boolean;
  who_can_message: PrivacySettings["whoCanMessage"];
  who_can_add_to_groups: PrivacySettings["whoCanAddToGroups"];
};

type DbBlockRow = {
  blocked_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
};

type DbReportRow = {
  id: string;
  target_user_id: string | null;
  target_message_id: string | null;
  category: ReportCategory;
  details: string | null;
  status: ReportRow["status"];
  created_at: string;
};

type DbGroupReportRow = DbReportRow & {
  reporter_id: string;
};

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

function mapPrivacy(row: DbPrivacyRow): PrivacySettings {
  return {
    discoverable: row.discoverable,
    profileVisibility: row.profile_visibility,
    showLastSeen: row.show_last_seen,
    showOnline: row.show_online,
    sendReadReceipts: row.send_read_receipts,
    whoCanMessage: row.who_can_message,
    whoCanAddToGroups: row.who_can_add_to_groups,
  };
}

function mapBlock(row: DbBlockRow): BlockRow {
  return {
    blockedId: row.blocked_id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function mapReport(row: DbReportRow): ReportRow {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    targetMessageId: row.target_message_id,
    category: row.category,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapGroupReport(row: DbGroupReportRow): GroupReportRow {
  return {
    ...mapReport(row),
    reporterId: row.reporter_id,
  };
}

function patchToRpcArgs(patch: PrivacyPatch): Record<string, unknown> {
  return {
    p_discoverable: patch.discoverable ?? null,
    p_profile_visibility: patch.profileVisibility ?? null,
    p_show_last_seen: patch.showLastSeen ?? null,
    p_show_online: patch.showOnline ?? null,
    p_send_read_receipts: patch.sendReadReceipts ?? null,
    p_who_can_message: patch.whoCanMessage ?? null,
    p_who_can_add_to_groups: patch.whoCanAddToGroups ?? null,
  };
}

export async function getPrivacy(rpc: RpcClient): Promise<Result<PrivacySettings>> {
  const result = await callRpc<DbPrivacyRow[]>(rpc, "get_privacy");
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapPrivacy(row));
}

export async function updatePrivacy(
  rpc: RpcClient,
  patch: PrivacyPatch,
): Promise<Result<PrivacySettings>> {
  const hasChange = Object.values(patch).some((value) => value !== undefined);
  if (!hasChange) {
    return err("safety.invalid_setting");
  }
  const args = patchToRpcArgs(patch);
  const result = await callRpc<null>(rpc, "update_privacy", args);
  if (!result.ok) {
    return result;
  }
  return getPrivacy(rpc);
}

export async function blockUser(
  rpc: RpcClient,
  blockedId: string,
): Promise<Result<BlockRow>> {
  const result = await callRpc<DbBlockRow[]>(rpc, "block_user", {
    p_blocked_id: blockedId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok({
    blockedId: row.blocked_id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  });
}

export async function unblockUser(
  rpc: RpcClient,
  blockedId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "unblock_user", {
    p_blocked_id: blockedId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function listBlocks(rpc: RpcClient): Promise<Result<BlockRow[]>> {
  const result = await callRpc<DbBlockRow[]>(rpc, "list_blocks");
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapBlock));
}

export async function reportUser(
  rpc: RpcClient,
  input: {
    targetUserId: string;
    category: ReportCategory;
    details?: string | null;
  },
): Promise<Result<string>> {
  const result = await callRpc<string>(rpc, "submit_report", {
    p_category: input.category,
    p_target_user_id: input.targetUserId,
    p_target_message_id: null,
    p_details: input.details ?? null,
  });
  if (!result.ok) {
    return result;
  }
  return ok(String(result.value));
}

export async function reportMessage(
  rpc: RpcClient,
  input: {
    targetMessageId: string;
    category: ReportCategory;
    details?: string | null;
    targetUserId?: string | null;
  },
): Promise<Result<string>> {
  const result = await callRpc<string>(rpc, "submit_report", {
    p_category: input.category,
    p_target_user_id: input.targetUserId ?? null,
    p_target_message_id: input.targetMessageId,
    p_details: input.details ?? null,
  });
  if (!result.ok) {
    return result;
  }
  return ok(String(result.value));
}

export async function listMyReports(rpc: RpcClient): Promise<Result<ReportRow[]>> {
  const result = await callRpc<DbReportRow[]>(rpc, "list_my_reports");
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapReport));
}

export async function listGroupReports(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<GroupReportRow[]>> {
  const result = await callRpc<DbGroupReportRow[]>(rpc, "list_group_reports", {
    p_conversation_id: conversationId,
  });
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapGroupReport));
}

export async function markReportReviewed(
  rpc: RpcClient,
  reportId: string,
): Promise<Result<ReportRow["status"]>> {
  const result = await callRpc<ReportRow["status"]>(rpc, "mark_report_reviewed", {
    p_report_id: reportId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(result.value);
}

export { decideInteraction };
