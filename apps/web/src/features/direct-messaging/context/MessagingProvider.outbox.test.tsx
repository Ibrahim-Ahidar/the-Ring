// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MessagingProvider,
  useDraft,
  useConversationView,
  useMessaging,
  useMessagingActions,
} from "./MessagingProvider";

import { createSqlLocalStore } from "@pulse/core";
import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";

const sendTextAction = vi.fn();
const dbHolder: { db?: ReturnType<typeof createNodeSqliteExecutor>; store?: ReturnType<typeof createSqlLocalStore> } = {};
const joinInbox = vi.fn();
const inboxLeave = vi.fn();

vi.mock("../actions", () => ({
  getConversationAction: vi.fn(async () => ({
    ok: false,
    error: { code: "platform.unexpected" },
  })),
  getConversationReceiptsAction: vi.fn(async () => ({ ok: true, value: {} })),
  markDeliveredAction: vi.fn(async () => ({ ok: true, value: null })),
  getArchivedSummaryAction: vi.fn(async () => ({ ok: true, value: { count: 0, unread: 0 } })),
  listConversationsAction: vi.fn(async () => ({
    ok: true,
    value: { items: [], hasMore: false },
  })),
  listMessagesAction: vi.fn(async () => ({
    ok: true,
    value: { items: [], hasMore: false },
  })),
  markReadAction: vi.fn(async () => ({ ok: true, value: {} })),
  sendTextAction: (...args: unknown[]) => sendTextAction(...args),
}));

// The encrypted sender stands in as sendTextAction: same input, same result shape.
vi.mock("@/platform/crypto/e2ee-runtime", () => ({
  getE2eeRuntime: async () => ({
    sendText: (input: unknown) => sendTextAction(input),
  }),
}));

vi.mock("@/platform/local-store", () => ({
  getLocalDb: async () => ({ db: dbHolder.db, store: dbHolder.store }),
  getLocalStore: async () => dbHolder.store,
}));

vi.mock("@/features/media/actions", () => ({
  getMessageAttachmentsAction: vi.fn(),
}));

vi.mock("@/platform/composer-events", () => ({
  emitComposerActivity: vi.fn(),
}));

vi.mock("@/platform/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

vi.mock("@/platform/realtime-hub", () => ({
  joinConversation: vi.fn(() => ({
    onStatus: () => () => {},
    onChange: () => () => {},
    leave: vi.fn(),
  })),
  joinInbox: (...args: unknown[]) => joinInbox(...args),
}));

type Api = ReturnType<typeof useMessaging>;

function Capture({ onReady }: { onReady: (api: Api) => void }) {
  onReady(useMessaging());
  return null;
}

function renderProvider() {
  let api: Api | null = null;
  render(
    <MessagingProvider userId="user-1" initialConversations={[]} initialConversationsHasMore={false}>
      <Capture onReady={(value) => (api = value)} />
    </MessagingProvider>,
  );
  return () => api!;
}

function okMessage(input: { clientId: string; conversationId: string; body: string }) {
  return {
    ok: true,
    value: {
      id: `msg-${input.clientId}`,
      conversation_id: input.conversationId,
      sender_id: "user-1",
      client_id: input.clientId,
      type: "text",
      body: input.body,
      reply_to_id: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      deletion_scope: "none",
      pinned_at: null,
      forwarded: false,
      metadata: null,
    },
  };
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_PULSE_E2EE", "1");
  sendTextAction.mockReset();
  joinInbox.mockReset();
  joinInbox.mockImplementation(() => ({ onStatus: () => () => {}, onChange: () => () => {}, leave: inboxLeave }));
  dbHolder.db = createNodeSqliteExecutor();
  dbHolder.store = createSqlLocalStore(dbHolder.db);
  await dbHolder.store.init();
});

afterEach(async () => {
  cleanup();
  const { resetTextOutbox } = await import("../lib/text-outbox");
  resetTextOutbox();
  vi.unstubAllEnvs();
});

describe("MessagingProvider sending with the e2ee flag on", () => {
  it("shows the pending bubble before the send RPC resolves, then settles it", async () => {
    const api = renderProvider();
    let release: () => void = () => {};
    sendTextAction.mockImplementation(
      (input: { clientId: string; conversationId: string; body: string }) =>
        new Promise((resolve) => {
          release = () => resolve(okMessage(input));
        }),
    );

    let sending: Promise<void> = Promise.resolve();
    await act(async () => {
      sending = api().sendMessage({ conversationId: "conv-1", body: "hi" });
      await sending;
    });
    expect(api().state.pendingSends).toHaveLength(1);
    expect(api().state.pendingSends[0]?.status).toBe("pending");
    const clientId = api().state.pendingSends[0]!.clientId;
    const rows = await dbHolder.store!.listMessages("conv-1", { limit: 10, before: null });
    expect(rows.map((r) => [r.id, r.status])).toEqual([[clientId, "pending"]]);

    await vi.waitFor(() => expect(sendTextAction).toHaveBeenCalledTimes(1));
    await act(async () => {
      release();
    });
    await vi.waitFor(() => expect(api().state.pendingSends).toEqual([]));
    const after = await dbHolder.store!.listMessages("conv-1", { limit: 10, before: null });
    expect(after.map((r) => [r.id, r.status])).toEqual([[`msg-${clientId}`, null]]);
  }, 10_000);

  it("restores an unsent message after a reload and delivers it once", async () => {
    sendTextAction.mockRejectedValue(new Error("offline"));
    const first = renderProvider();
    await act(async () => {
      await first().sendMessage({ conversationId: "conv-1", body: "later" });
    });
    await vi.waitFor(() => expect(sendTextAction).toHaveBeenCalledTimes(1));
    cleanup();
    const { resetTextOutbox } = await import("../lib/text-outbox");
    resetTextOutbox();

    sendTextAction.mockReset();
    sendTextAction.mockImplementation(async (input: { clientId: string; conversationId: string; body: string }) =>
      okMessage(input),
    );
    const second = renderProvider();
    await vi.waitFor(() => expect(second().state.pendingSends).toHaveLength(1));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await vi.waitFor(() => expect(second().state.pendingSends).toEqual([]));
    expect(sendTextAction).toHaveBeenCalledTimes(1);
  }, 10_000);
});
