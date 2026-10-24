/** Mailbox transport types (issue #225). Payloads are opaque to the server. */

/** Largest envelope a Broadcast frame carries; bigger ones are fetched by id. */
export const BROADCAST_MAX_BYTES = 16 * 1024;
/** Rows per fetch_mailbox page. */
export const MAILBOX_PAGE_SIZE = 500;

/** What a device receives. `payload` is the decoded ciphertext bytes. */
export type MailboxEnvelope = {
  seq: number;
  id: string;
  senderDeviceId: string | null;
  senderUserId: string;
  conversationId: string | null;
  kind: number;
  payload: Uint8Array;
  createdAt: string;
};

export type OutgoingEnvelope = {
  /** Client-generated id; a resend with the same id is deduped by the server. */
  id: string;
  recipientDeviceId: string;
  senderDeviceId: string;
  conversationId?: string | null;
  kind?: number;
  payload: Uint8Array;
};

export type SendStatus = "sent" | "duplicate" | "blocked" | "forbidden";
export type SendResult = { id: string; status: SendStatus };

/** Row shape returned by fetch_mailbox (ciphertext is base64 text). */
export type WireEnvelope = {
  seq: number | string | null;
  id: string;
  sender_device_id: string | null;
  sender_user_id: string;
  conversation_id: string | null;
  kind: number;
  ciphertext: string;
  created_at: string;
};

/** What arrives on device:<id> Broadcast: the whole envelope, or just its id when large. */
export type BroadcastFrame =
  | { type: "envelope"; envelope: WireEnvelope }
  | { type: "ref"; id: string };
