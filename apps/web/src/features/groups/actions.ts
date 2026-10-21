"use server";

import { randomUUID } from "node:crypto";

import {
  listGroupReports,
  markReportReviewed,
} from "@/features/safety/service";
import { createSupabaseAdminClient } from "@/platform/supabase/admin";
import { getSessionContext } from "@/platform/session";
import type { Result } from "@pulse/core/result";
import { err } from "@pulse/core/result";

import * as groups from "./service";
import type { FailedInvite } from "./service";
import type { GroupMember, GroupSummary, InviteLink } from "./types";
import type { GroupReportRow } from "@/features/safety/types";

async function requireSession() {
  return getSessionContext();
}

export async function createGroupAction(input: {
  name: string;
  description?: string | null;
  /** Usernames to add as members right after the group is created. */
  members?: string[];
}): Promise<Result<{ conversationId: string; failedInvites: FailedInvite[] }>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.createGroup(session.rpc, input);
}

export async function updateGroupAction(input: {
  conversationId: string;
  name?: string | null;
  description?: string | null;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.updateGroup(session.rpc, input);
}

export async function uploadGroupAvatarAction(
  conversationId: string,
  formData: FormData,
): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return err("groups.avatar_rejected");
  }

  const validated = groups.validateGroupAvatarUpload(file.type, file.size);
  if (!validated.ok) {
    return validated;
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";

  const objectPath = `group-avatars/${conversationId}/${randomUUID()}.${ext}`;
  const admin = createSupabaseAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("attachments")
    .upload(objectPath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return err("groups.avatar_rejected");
  }

  return groups.setGroupAvatarPath(session.rpc, conversationId, objectPath);
}

export async function getGroupAction(
  conversationId: string,
): Promise<Result<GroupSummary>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.getGroup(session.rpc, conversationId);
}

export async function listMembersAction(
  conversationId: string,
): Promise<Result<GroupMember[]>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.listMembers(session.rpc, conversationId);
}

export async function inviteMemberAction(input: {
  conversationId: string;
  username: string;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.inviteMember(session.rpc, input);
}

export async function createInviteLinkAction(input: {
  conversationId: string;
  expiresAt?: string | null;
  maxUses?: number | null;
}): Promise<Result<InviteLink>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.createInviteLink(session.rpc, input);
}

export async function revokeInviteLinkAction(
  linkId: string,
): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.revokeInviteLink(session.rpc, linkId);
}

export async function joinByCodeAction(
  code: string,
): Promise<Result<{ conversationId: string }>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.joinByCode(session.rpc, code);
}

export async function setRoleAction(input: {
  conversationId: string;
  userId: string;
  role: "member" | "admin";
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.setRole(session.rpc, input);
}

export async function transferOwnershipAction(input: {
  conversationId: string;
  userId: string;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.transferOwnership(session.rpc, input);
}

export async function setMessagingRestrictedAction(input: {
  conversationId: string;
  userId: string;
  restricted: boolean;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.setMessagingRestricted(session.rpc, input);
}

export async function removeMemberAction(input: {
  conversationId: string;
  userId: string;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.removeMember(session.rpc, input);
}

export async function leaveGroupAction(
  conversationId: string,
): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return groups.leaveGroup(session.rpc, conversationId);
}

export async function listGroupReportsAction(
  conversationId: string,
): Promise<Result<GroupReportRow[]>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return listGroupReports(session.rpc, conversationId);
}

export async function markGroupReportReviewedAction(
  reportId: string,
): Promise<Result<GroupReportRow["status"]>> {
  const session = await requireSession();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return markReportReviewed(session.rpc, reportId);
}
