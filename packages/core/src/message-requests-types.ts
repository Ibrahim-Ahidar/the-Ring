export type RequestStatus = "pending" | "accepted" | "declined";

export type MessageRequest = {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  note: string | null;
  status: RequestStatus;
  conversationId: string | null;
  createdAt: string;
};
