import {
  acceptRequest,
  createRequest,
  declineRequest,
  listIncoming,
  listOutgoing,
} from "@pulse/core/message-requests";
import { blockUser, getPrivacy, listBlocks, listMyReports, reportUser, unblockUser, updatePrivacy } from "@pulse/core/safety";
import type { PrivacyPatch, ReportCategory } from "@pulse/core/safety-types";

import { rpcClient } from "./rpc";

export type { MessageRequest } from "@pulse/core/message-requests-types";
export type {
  BlockRow,
  PrivacyPatch,
  PrivacySettings,
  ProfileVisibility,
  ReportCategory,
  ReportRow,
  WhoCanAddToGroups,
  WhoCanMessage,
} from "@pulse/core/safety-types";

export const REPORT_CATEGORIES: readonly ReportCategory[] = ["spam", "harassment", "impersonation", "other"];

export const listMessageRequests = () => listIncoming(rpcClient);
export const listSentMessageRequests = () => listOutgoing(rpcClient);
export const sendMessageRequest = (username: string, note: string) =>
  createRequest(rpcClient, { username, note });
export const acceptMessageRequest = (id: string) => acceptRequest(rpcClient, id);
export const declineMessageRequest = (id: string) => declineRequest(rpcClient, id);
export const blockChatUser = (userId: string) => blockUser(rpcClient, userId);
export const unblockChatUser = (userId: string) => unblockUser(rpcClient, userId);
export const listBlockedUsers = () => listBlocks(rpcClient);
export const reportChatUser = (userId: string, category: ReportCategory, details?: string | null) =>
  reportUser(rpcClient, { targetUserId: userId, category, details });
export const getPrivacySettings = () => getPrivacy(rpcClient);
export const updatePrivacySettings = (patch: PrivacyPatch) => updatePrivacy(rpcClient, patch);
export const listMyReportRows = () => listMyReports(rpcClient);
