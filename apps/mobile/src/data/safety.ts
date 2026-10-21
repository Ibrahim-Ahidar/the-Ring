import {
  acceptRequest,
  declineRequest,
  listIncoming,
} from "@pulse/core/message-requests";
import { blockUser, listBlocks, reportUser, unblockUser } from "@pulse/core/safety";
import type { ReportCategory } from "@pulse/core/safety-types";

import { rpcClient } from "./rpc";

export type { MessageRequest } from "@pulse/core/message-requests-types";
export type { BlockRow, ReportCategory } from "@pulse/core/safety-types";

export const REPORT_CATEGORIES: readonly ReportCategory[] = ["spam", "harassment", "impersonation", "other"];

export const listMessageRequests = () => listIncoming(rpcClient);
export const acceptMessageRequest = (id: string) => acceptRequest(rpcClient, id);
export const declineMessageRequest = (id: string) => declineRequest(rpcClient, id);
export const blockChatUser = (userId: string) => blockUser(rpcClient, userId);
export const unblockChatUser = (userId: string) => unblockUser(rpcClient, userId);
export const listBlockedUsers = () => listBlocks(rpcClient);
export const reportChatUser = (userId: string, category: ReportCategory, details?: string | null) =>
  reportUser(rpcClient, { targetUserId: userId, category, details });
