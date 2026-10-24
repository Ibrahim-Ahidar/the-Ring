import {
  MESSAGE_PAGE_SIZE,
  decodeMessagePageCursor,
  type ConversationSummary,
  type ListConversationsResult,
  type ListMessagesResult,
  type RpcMessageRow,
} from "@pulse/core";
import {
  CONVERSATION_EXTRA_PREFIX,
  rowToRpcMessage,
  rowToSummary,
  rpcMessageToRow,
  summaryToRow,
  type LocalStore,
} from "@pulse/core/local-store";
import { ok, type Result } from "@pulse/core/result";


export type ListConversationsArgs = {
  cursor?: string | null;
  archivedOnly?: boolean;
  unreadOnly?: boolean;
  folderId?: string | null;
  type?: "direct" | "group" | null;
};

export type RemoteSource = {
  listConversations(args: ListConversationsArgs): Promise<Result<ListConversationsResult>>;
  listMessages(input: {
    conversationId: string;
    cursor?: string | null;
  }): Promise<Result<ListMessagesResult>>;
};

export type LocalFirstSource = RemoteSource & {
  /** Network to local DB only. Returns nothing; readers use the list methods. */
  syncConversations(): Promise<void>;
  syncMessages(conversationId: string): Promise<void>;
  /** Writes a message that arrived over realtime into the local DB. */
  applyRealtimeMessage(row: Record<string, unknown>): Promise<void>;
};

const CONVERSATIONS_STATE_KEY = "sync:conversations";
const messagesStateKey = (id: string) => `sync:messages:${id}`;

type MessagesState = { limit: number; complete: boolean };

function isDefaultView(args: ListConversationsArgs): boolean {
  return !args.cursor && !args.archivedOnly && !args.unreadOnly && !args.folderId && !args.type;
}

function parseMessagesState(raw: string | null): MessagesState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MessagesState>;
    if (typeof v.limit === "number" && typeof v.complete === "boolean") {
      return { limit: v.limit, complete: v.complete };
    }
  } catch {
    // treated as cold
  }
  return null;
}

/**
 * With the e2ee flag on, the chat list and chat view read only from the local database.
 * The network only fills it: a cold chat is fetched once, then served locally with no RPC.
 * List views with filters or a paging cursor (archived, folders, ...) pass through to the
 * network, because the local copy holds just the default list.
 */
export function createLocalFirstSource(
  store: LocalStore,
  remote: RemoteSource,
  now: () => string = () => new Date().toISOString(),
): LocalFirstSource {
  async function readConversations(): Promise<ListConversationsResult> {
    const rows = await store.listConversations();
    const extras = new Map(
      (await store.listKv(CONVERSATION_EXTRA_PREFIX)).map((e) => [e.key, e.value]),
    );
    const state = await store.getKv(CONVERSATIONS_STATE_KEY);
    const items: ConversationSummary[] = rows.map((row) =>
      rowToSummary(row, extras.get(CONVERSATION_EXTRA_PREFIX + row.id) ?? null),
    );
    return { items, hasMore: state === "more" };
  }

  async function syncConversations(): Promise<void> {
    const res = await remote.listConversations({});
    if (!res.ok) return;
    const incoming = res.value.items.map(summaryToRow);
    await store.upsertConversations(incoming.map((i) => i.row));
    for (const i of incoming) {
      await store.setKv(i.extraKey, i.extra);
    }
    await store.setKv(CONVERSATIONS_STATE_KEY, res.value.hasMore ? "more" : "all");
  }

  async function writeMessages(items: RpcMessageRow[]) {
    const received = now();
    await store.upsertMessages(items.map((m) => rpcMessageToRow(m, received)));
  }

  async function readMessages(
    conversationId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ items: RpcMessageRow[]; more: boolean }> {
    const decoded = cursor ? decodeMessagePageCursor(cursor) : null;
    // Unsent local rows (outbox) are shown as pending bubbles, never as real messages.
    const rows = (
      await store.listMessages(conversationId, {
        limit: limit + 1,
        before: decoded ? { sentAt: decoded.createdAt, id: decoded.id } : null,
      })
    ).filter((r) => r.status !== "pending" && r.status !== "failed");
    return { items: rows.slice(0, limit).map(rowToRpcMessage), more: rows.length > limit };
  }

  async function syncMessages(conversationId: string): Promise<void> {
    const res = await remote.listMessages({ conversationId });
    if (!res.ok) return;
    await writeMessages(res.value.items);
    const key = messagesStateKey(conversationId);
    const prev = parseMessagesState(await store.getKv(key));
    const limit = res.value.hasMore ? res.value.items.length : MESSAGE_PAGE_SIZE;
    // Refreshing the newest page must not claim that older history is complete.
    const complete = prev ? prev.complete : !res.value.hasMore;
    await store.setKv(key, JSON.stringify({ limit: Math.max(limit, prev?.limit ?? 0), complete }));
  }

  return {
    syncConversations,
    syncMessages,

    async listConversations(args) {
      if (!isDefaultView(args)) {
        return remote.listConversations(args);
      }
      if ((await store.getKv(CONVERSATIONS_STATE_KEY)) === null) {
        await syncConversations();
        if ((await store.getKv(CONVERSATIONS_STATE_KEY)) === null) {
          return remote.listConversations(args);
        }
      }
      return ok(await readConversations());
    },

    async listMessages({ conversationId, cursor }) {
      const key = messagesStateKey(conversationId);
      let state = parseMessagesState(await store.getKv(key));
      if (!state) {
        await syncMessages(conversationId);
        state = parseMessagesState(await store.getKv(key));
        if (!state) return remote.listMessages({ conversationId, cursor });
      }
      let page = await readMessages(conversationId, state.limit, cursor ?? null);
      if (!page.more && !state.complete && cursor) {
        // Older history is not stored yet: fetch that one page, then read it back locally.
        const res = await remote.listMessages({ conversationId, cursor });
        if (!res.ok) return ok({ items: page.items, hasMore: true });
        await writeMessages(res.value.items);
        state = { limit: state.limit, complete: !res.value.hasMore };
        await store.setKv(key, JSON.stringify(state));
        page = await readMessages(conversationId, state.limit, cursor);
      }
      return ok({ items: page.items, hasMore: page.more || !state.complete });
    },

    async applyRealtimeMessage(row) {
      const { id, conversation_id: conversationId, created_at: createdAt } = row;
      if (
        typeof id !== "string" ||
        typeof conversationId !== "string" ||
        typeof createdAt !== "string"
      ) {
        return;
      }
      const str = (v: unknown) => (typeof v === "string" ? v : null);
      const message: RpcMessageRow = {
        id,
        conversation_id: conversationId,
        sender_id: str(row.sender_id) ?? "",
        client_id: str(row.client_id) ?? id,
        type: (str(row.type) ?? "text") as RpcMessageRow["type"],
        body: str(row.body),
        reply_to_id: str(row.reply_to_id),
        created_at: createdAt,
        edited_at: str(row.edited_at),
        deleted_at: str(row.deleted_at),
        deletion_scope: (str(row.deletion_scope) ?? "none") as RpcMessageRow["deletion_scope"],
        pinned_at: str(row.pinned_at),
        forwarded: row.forwarded === true,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : null,
      };
      await writeMessages([message]);
    },
  };
}
