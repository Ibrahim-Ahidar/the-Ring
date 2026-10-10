export type MessageRequestStatus = "pending" | "accepted" | "declined";

export type IncomingMessageRequest = {
  id: string;
  fromUserId: string;
  username: string;
  displayName: string | null;
  note: string | null;
  status: MessageRequestStatus;
  conversationId: string | null;
  createdAt: string;
};

export type OutgoingMessageRequest = {
  id: string;
  toUserId: string;
  username: string;
  displayName: string | null;
  note: string | null;
  status: MessageRequestStatus;
  conversationId: string | null;
  createdAt: string;
};

export type MessageRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  conversation_id: string | null;
  status: MessageRequestStatus;
  note: string | null;
  created_at: string;
};

type DbIncomingRow = {
  id: string;
  from_user_id: string;
  username: string;
  display_name: string | null;
  note: string | null;
  status: MessageRequestStatus;
  conversation_id: string | null;
  created_at: string;
};

type DbOutgoingRow = {
  id: string;
  to_user_id: string;
  username: string;
  display_name: string | null;
  note: string | null;
  status: MessageRequestStatus;
  conversation_id: string | null;
  created_at: string;
};

export function mapIncoming(row: DbIncomingRow): IncomingMessageRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    username: row.username,
    displayName: row.display_name,
    note: row.note,
    status: row.status,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  };
}

export function mapOutgoing(row: DbOutgoingRow): OutgoingMessageRequest {
  return {
    id: row.id,
    toUserId: row.to_user_id,
    username: row.username,
    displayName: row.display_name,
    note: row.note,
    status: row.status,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  };
}

export function mapRequestRow(raw: MessageRequestRow): {
  id: string;
  fromUserId: string;
  toUserId: string;
  conversationId: string | null;
  status: MessageRequestStatus;
  note: string | null;
  createdAt: string;
} {
  return {
    id: raw.id,
    fromUserId: raw.from_user_id,
    toUserId: raw.to_user_id,
    conversationId: raw.conversation_id,
    status: raw.status,
    note: raw.note,
    createdAt: raw.created_at,
  };
}
