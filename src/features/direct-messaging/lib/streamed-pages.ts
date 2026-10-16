import type { TimelineMessage } from "@/platform/timeline";

import type { ConversationSummary } from "../types";

/** First page of the chat list, streamed from the server page. Never rejects. */
export type InboxPage = { items: ConversationSummary[]; hasMore: boolean };

/** First page of a thread, streamed from the server page. Never rejects. */
export type ThreadPage =
  | { ok: true; items: TimelineMessage[]; hasMore: boolean }
  | { ok: false; code: string };
