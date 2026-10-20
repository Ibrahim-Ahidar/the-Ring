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
