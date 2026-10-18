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

const sendTextAction = vi.fn();
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

function ActionsCapture({
  onReady,
}: {
  onReady: (actions: ReturnType<typeof useMessagingActions>) => void;
}) {
  onReady(useMessagingActions());
  return null;
}

describe("MessagingProvider failures and offline", () => {
  it("marks a send failed when the action throws", async () => {
    sendTextAction.mockRejectedValue(new Error("network"));
    const api = renderProvider();
    await act(async () => {
      await api().sendMessage({ conversationId: "conv-1", body: "boom" });
    });
    expect(api().state.pendingSends).toHaveLength(1);
    expect(api().state.pendingSends[0]?.status).toBe("failed");
  });

  it("keeps sends pending while offline and flushes them when back online", async () => {
    const api = renderProvider();
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(api().state.connectionStatus).toBe("offline");
    await act(async () => {
      await api().sendMessage({ conversationId: "conv-1", body: "later" });
    });
    expect(sendTextAction).not.toHaveBeenCalled();
    expect(api().state.pendingSends[0]?.status).toBe("pending");

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(sendTextAction).toHaveBeenCalledTimes(1);
    expect(api().state.pendingSends).toEqual([]);
  });

  it("discardSend removes a failed send", async () => {
    sendTextAction.mockRejectedValue(new Error("network"));
    let latest: Api | null = null;
    let actions: ReturnType<typeof useMessagingActions> | null = null;
    render(
      <MessagingProvider
        userId="user-1"
        initialConversations={[]}
        initialConversationsHasMore={false}
      >
        <Capture onReady={(value) => (latest = value)} />
        <ActionsCapture onReady={(a) => (actions = a)} />
      </MessagingProvider>,
    );
    await act(async () => {
      await latest!.sendMessage({ conversationId: "conv-1", body: "x" });
    });
    const clientId = latest!.state.pendingSends[0]!.clientId;
    await act(async () => {
      actions!.discardSend(clientId);
    });
    expect(latest!.state.pendingSends).toEqual([]);
  });

  it("a draft change does not change the conversation view or the actions", async () => {
    const views: unknown[] = [];
    const actionRefs: unknown[] = [];
    let setDraft: (id: string, text: string) => void = () => {};
    function Probe() {
      views.push(useConversationView("conv-1"));
      const actions = useMessagingActions();
      actionRefs.push(actions);
      setDraft = actions.setDraft;
      return null;
    }
    render(
      <MessagingProvider
        userId="user-1"
        initialConversations={[]}
        initialConversationsHasMore={false}
      >
        <Probe />
      </MessagingProvider>,
    );
    const view = views[views.length - 1];
    const actions = actionRefs[actionRefs.length - 1];
    await act(async () => {
      setDraft("conv-1", "typing");
    });
    expect(views[views.length - 1]).toBe(view);
    expect(actionRefs[actionRefs.length - 1]).toBe(actions);
  });

  it("a keystroke re-renders only the draft consumer, not the thread list", async () => {
    let listRenders = 0;
    let composerRenders = 0;
    let setDraft: (id: string, text: string) => void = () => {};
    let draft = "";
    function ThreadList() {
      useMessaging();
      listRenders += 1;
      return null;
    }
    function Composer() {
      draft = useDraft("conv-1");
      setDraft = useMessagingActions().setDraft;
      composerRenders += 1;
      return null;
    }
    render(
      <MessagingProvider
        userId="user-1"
        initialConversations={[]}
        initialConversationsHasMore={false}
      >
        <ThreadList />
        <Composer />
      </MessagingProvider>,
    );
    await act(async () => {}); // let mount effects settle
    const listBefore = listRenders;
    const composerBefore = composerRenders;
    for (const text of ["h", "he", "hel", "hell", "hello"]) {
      await act(async () => {
        setDraft("conv-1", text);
      });
    }
    expect(draft).toBe("hello");
    expect(composerRenders).toBe(composerBefore + 5);
    expect(listRenders).toBe(listBefore);
  });
});
