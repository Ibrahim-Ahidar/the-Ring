// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingProvider, useMessaging } from "./MessagingProvider";

const sendTextAction = vi.fn();
const joinInbox = vi.fn();
const inboxLeave = vi.fn();

vi.mock("../actions", () => ({
  getConversationAction: vi.fn(),
  listConversationsAction: vi.fn(async () => ({
    ok: true,
    value: { items: [], hasMore: false },
  })),
  listMessagesAction: vi.fn(async () => ({
    ok: true,
    value: { items: [], hasMore: false },
  })),
  markReadAction: vi.fn(),
  sendTextAction: (...args: unknown[]) => sendTextAction(...args),
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
    <MessagingProvider
      userId="user-1"
      initialConversations={[]}
      initialConversationsHasMore={false}
    >
      <Capture onReady={(value) => (api = value)} />
    </MessagingProvider>,
  );
  return () => api!;
}

beforeEach(() => {
  sendTextAction.mockReset();
  joinInbox.mockReset();
  inboxLeave.mockReset();
  joinInbox.mockImplementation(() => ({
    onStatus: () => () => {},
    onChange: () => () => {},
    leave: inboxLeave,
  }));
  sendTextAction.mockImplementation(async (input: { clientId: string; conversationId: string; body: string }) => ({
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
  }));
});

afterEach(() => {
  cleanup();
});

describe("MessagingProvider sending", () => {
  it("sends a message exactly once while connected", async () => {
    const api = renderProvider();
    const respond = sendTextAction.getMockImplementation()!;
    const waiting: Array<() => void> = [];
    sendTextAction.mockImplementation(
      (input: { clientId: string; conversationId: string; body: string }) =>
        new Promise((resolve) => {
          waiting.push(() => resolve(respond(input)));
        }),
    );

    let sending: Promise<void> = Promise.resolve();
    await act(async () => {
      sending = api().sendMessage({ conversationId: "conv-1", body: "hi" });
    });
    await act(async () => {
      waiting.forEach((release) => release());
      await sending;
    });

    expect(sendTextAction).toHaveBeenCalledTimes(1);
    expect(api().state.pendingSends).toEqual([]);
  }, 10_000);

  it("sends immediately even while the realtime socket is reconnecting", async () => {
    let emitStatus: (status: string) => void = () => {};
    joinInbox.mockImplementation(() => ({
      onStatus: (listener: (status: string) => void) => {
        emitStatus = listener;
        return () => {};
      },
      onChange: () => () => {},
      leave: inboxLeave,
    }));
    const api = renderProvider();

    await act(async () => {
      emitStatus("CHANNEL_ERROR");
    });
    await act(async () => {
      await api().sendMessage({ conversationId: "conv-1", body: "offline" });
    });
    expect(sendTextAction).toHaveBeenCalledTimes(1);
    expect(api().state.pendingSends).toEqual([]);

    await act(async () => {
      emitStatus("SUBSCRIBED");
    });
    expect(sendTextAction).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("keeps the inbox realtime channel open across sends", async () => {
    const api = renderProvider();
    expect(joinInbox).toHaveBeenCalledTimes(1);

    await act(async () => {
      await api().sendMessage({ conversationId: "conv-1", body: "one" });
      await api().sendMessage({ conversationId: "conv-1", body: "two" });
    });

    expect(joinInbox).toHaveBeenCalledTimes(1);
    expect(inboxLeave).not.toHaveBeenCalled();
  });
});
