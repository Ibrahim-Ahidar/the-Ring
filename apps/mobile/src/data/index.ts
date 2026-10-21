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
