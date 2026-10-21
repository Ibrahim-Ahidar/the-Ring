// The only module screens and hooks import for backend access.
export { getSession, onSessionChange, signInWithPassword, signOut, type AppSession } from "./auth";
export { rpc, rpcClient } from "./rpc";
export {
  getChat,
  listChatMessages,
  listChats,
  markChatDelivered,
  markChatRead,
  newClientId,
  sendChatText,
  subscribeChat,
  subscribeChatList,
  type ChatPage,
} from "./chats";
export type {
  ConversationDetail,
  ConversationSummary,
  OutboundDelivery,
  RpcMessageRow,
} from "@pulse/core";
export {
  firstUnreadMessageId,
  initialScrollTarget,
  outboundDeliveryStatus,
  type InitialScroll,
} from "@pulse/core";
export {
  openTypingChannel,
  readPeerOnline,
  readPeerPresence,
  touchMyLastSeen,
  type TypingBroadcast,
} from "./presence";
export {
  deriveSubtitle,
  initialTypingState,
  lastSeenBucket,
  reduceTyping,
  visibleTypers,
  type Subtitle,
  type TypingState,
} from "@pulse/core";
export { registerDevice, unregisterDevice } from "./devices";
export {
  addChatReaction,
  deleteChatMessageForEveryone,
  editChatMessage,
  listChatReactions,
  removeChatReaction,
} from "./message-actions";
export {
  ALLOWED_REACTION_EMOJI,
  availableActions,
  groupReactions,
  reactionToggle,
  type MessageAction,
  type MessageReaction,
  type ReactionGroup,
} from "@pulse/core";
export { getAttachmentUrl, listMessageAttachments, sendChatMedia, type MediaUploadInput } from "./media";
export { AUDIO_MAX_DURATION_MS, normalizeMimeType, validateAttachment, type MessageAttachment } from "@pulse/core";
export {
  createChatGroup,
  getChatGroup,
  inviteGroupMember,
  leaveChatGroup,
  listGroupMembers,
  removeGroupMember,
  updateChatGroup,
  type FailedInvite,
  type GroupMember,
  type GroupSummary,
} from "./groups";
export {
  REPORT_CATEGORIES,
  acceptMessageRequest,
  blockChatUser,
  declineMessageRequest,
  listBlockedUsers,
  listMessageRequests,
  reportChatUser,
  unblockChatUser,
  type BlockRow,
  type MessageRequest,
  type ReportCategory,
} from "./safety";
