import type { TimelineMessage } from "@pulse/core/timeline";

import type { ConversationSummary } from "../types";

/** First page of the chat list, streamed from the server page. Never rejects. */
export type InboxPage = {
  items: ConversationSummary[];
  hasMore: boolean;
  /** The read failed: `items` is empty because of an outage, not because there are no chats. */
  failed?: boolean;
};

/** First page of a thread, streamed from the server page. Never rejects. */
export type ThreadPage =
  | { ok: true; items: TimelineMessage[]; hasMore: boolean }
  | { ok: false; code: string };
