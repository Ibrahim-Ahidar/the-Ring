// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/features/direct-messaging/context/MessagingProvider";
import { ThreadPanel } from "@/features/direct-messaging/components/ThreadPanel";
import type { ConversationDetail } from "@/features/direct-messaging/types";
import type { TimelineMessage } from "@/platform/timeline";
import directMessagingEn from "@/features/direct-messaging/messages/en.json";
import typingPresenceEn from "@/features/typing-presence/messages/en.json";
import shellEn from "@/shell/messages/en.json";

const VIEWER = "viewer-0000-0000";
const PEER = "peer-00000-0000";
const CONV = "conv-1";

const hub = vi.hoisted(() => ({
  broadcast: [] as Array<(event: string, payload: Record<string, unknown>) => void>,
  status: [] as Array<(status: string) => void>,
  presence: [] as Array<(state: Record<string, unknown[]>) => void>,
  change: [] as Array<(change: unknown) => void>,
  counts: {} as Record<string, number>,
  bump(name: string) {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  },
}));

// Some imported modules are marked server-only; the render-count probe runs them in jsdom.
vi.mock("server-only", () => ({}));

vi.mock("@/features/direct-messaging/actions", () => ({
  getConversationAction: vi.fn(async () => ({ ok: false, error: { code: "platform.unexpected" } })),
  getConversationReceiptsAction: vi.fn(async () => ({ ok: true, value: {} })),
  markDeliveredAction: vi.fn(async () => ({ ok: true, value: null })),
  listConversationsAction: vi.fn(async () => ({ ok: true, value: { items: [], hasMore: false } })),
  listMessagesAction: vi.fn(async () => ({ ok: true, value: { items: [], hasMore: false } })),
  markReadAction: vi.fn(async () => ({ ok: true, value: {} })),
  sendTextAction: vi.fn(),
}));
vi.mock("@/features/media/actions", () => ({ getMessageAttachmentsAction: vi.fn() }));
vi.mock("@/features/groups/actions", () => ({
  listMembersAction: vi.fn(async () => ({ ok: true, value: [] })),
}));

vi.mock("@/platform/supabase/browser", () => {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "viewer-0000-0000" } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  };
  return { createSupabaseBrowserClient: () => client };
});

vi.mock("@/platform/realtime-hub", () => ({
  joinConversation: () => ({
    onBroadcast: (cb: (event: string, payload: Record<string, unknown>) => void) => {
      hub.broadcast.push(cb);
      return () => {
        hub.broadcast = hub.broadcast.filter((x) => x !== cb);
      };
    },
    onPresence: (cb: (state: Record<string, unknown[]>) => void) => {
      hub.presence.push(cb);
      return () => {
        hub.presence = hub.presence.filter((x) => x !== cb);
      };
    },
    onStatus: (cb: (status: string) => void) => {
      hub.status.push(cb);
      return () => {
        hub.status = hub.status.filter((x) => x !== cb);
      };
    },
    onChange: (cb: (change: unknown) => void) => {
      hub.change.push(cb);
      return () => {
        hub.change = hub.change.filter((x) => x !== cb);
      };
    },
    send: async () => {},
    track: async () => {},
    untrack: async () => {},
    leave: () => {},
  }),
  joinInbox: () => ({
    onBroadcast: () => () => {},
    onPresence: () => () => {},
    onStatus: () => () => {},
    onChange: () => () => {},
    send: async () => {},
    track: async () => {},
    untrack: async () => {},
    leave: () => {},
  }),
}));

vi.mock("@/features/typing-presence/service", () => ({
  fetchSubjectPresence: vi.fn(async () => ({
    ok: true,
    value: {
      display_name: "Peer",
      presence_allowed: true,
      show_last_seen: true,
      last_seen_at: null,
    },
  })),
  touchLastSeenForMember: vi.fn(async () => ({ ok: true, value: true })),
}));

vi.mock("@/shell/slots", async () => {
  const { contributions } = await import("@/features/typing-presence/contributions");
  return {
    getContributions: (kind: string) =>
      kind === "headerStatus" ? (contributions.headerStatus ?? []).map((c) => ({ ...c })) : [],
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/chats/conv-1",
  useSearchParams: () => new URLSearchParams(),
}));

// --- render counters: wrap each memo component's inner function (`.type`) ---
type Memo = { type: (p: object) => ReactNode; compare: ((a: object, b: object) => boolean) | null };

vi.mock("@/features/direct-messaging/components/ThreadPanel", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/direct-messaging/components/ThreadPanel")>();
  const { memo } = await import("react");
  const Real = mod.ThreadPanel as unknown as Memo;
  return {
    ...mod,
    ThreadPanel: memo(function CountedThreadPanel(p: object) {
      hub.bump("ThreadPanel");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});
vi.mock("@/features/direct-messaging/components/MessageTimeline", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/direct-messaging/components/MessageTimeline")>();
  const { memo } = await import("react");
  const Real = mod.MessageTimeline as unknown as Memo;
  return {
    ...mod,
    MessageTimeline: memo(function CountedMessageTimeline(p: object) {
      hub.bump("MessageTimeline");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});
vi.mock("@/features/direct-messaging/components/MessageBubble", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/direct-messaging/components/MessageBubble")>();
  const { memo } = await import("react");
  const Real = mod.MessageBubble as unknown as Memo;
  return {
    ...mod,
    MessageBubble: memo(function CountedMessageBubble(p: object) {
      hub.bump("MessageBubble");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});
vi.mock("@/features/direct-messaging/components/MessageComposer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/direct-messaging/components/MessageComposer")>();
  const { memo } = await import("react");
  const Real = mod.MessageComposer as unknown as Memo;
  return {
    ...mod,
    MessageComposer: memo(function CountedMessageComposer(p: object) {
      hub.bump("MessageComposer");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});
vi.mock("@/features/typing-presence/components/ConversationHeaderStatus", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/typing-presence/components/ConversationHeaderStatus")>();
  const { memo } = await import("react");
  const Real = mod.ConversationHeaderStatus as unknown as Memo;
  return {
    ...mod,
    ConversationHeaderStatus: memo(function CountedConversationHeaderStatus(p: object) {
      hub.bump("ConversationHeaderStatus");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});
vi.mock("@/features/typing-presence/components/HeaderStatusView", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/typing-presence/components/HeaderStatusView")>();
  const { memo } = await import("react");
  const Real = mod.HeaderStatusView as unknown as Memo;
  return {
    ...mod,
    HeaderStatusView: memo(function CountedHeaderStatusView(p: object) {
      hub.bump("HeaderStatusView");
      return Real.type(p);
    }, Real.compare ?? undefined),
  };
});

const messages = {
  shell: shellEn,
  "direct-messaging": directMessagingEn,
  "typing-presence": typingPresenceEn,
};

function buildMessages(count: number): TimelineMessage[] {
  const start = Date.UTC(2026, 0, 1, 10, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${String(i).padStart(4, "0")}`,
    conversation_id: CONV,
    sender_id: i % 2 === 0 ? PEER : VIEWER,
    client_id: `client-${i}`,
    type: "text" as const,
    body: `Message number ${i}`,
    reply_to_id: null,
    created_at: new Date(start + i * 60_000).toISOString(),
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none" as const,
    pinned_at: null,
    forwarded: false,
    metadata: null,
  }));
}

const detail: ConversationDetail = {
  id: CONV,
  type: "direct",
  title: null,
  last_message_at: null,
  last_message_id: null,
  last_read_message_id: null,
  last_read_at: null,
  pinned_at: null,
  archived_at: null,
  muted_until: null,
  other_user_id: PEER,
  other_username: "peer",
  other_display_name: "Peer",
  other_avatar_url: null,
  other_last_read_message_id: null,
  other_last_read_created_at: null,
  other_send_read_receipts: true,
  other_last_delivered_at: null,
  role: "member",
};

const initialMessages = buildMessages(200);

function App() {
  return (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <MessagingProvider
        userId={VIEWER}
        initialConversations={[]}
        initialConversationsHasMore={false}
        initialConversationId={CONV}
        initialMessages={initialMessages}
        initialDetail={detail}
      >
        <ThreadPanel conversationId={CONV} detail={detail} currentUserId={VIEWER} />
      </MessagingProvider>
    </NextIntlClientProvider>
  );
}

function reset() {
  for (const key of Object.keys(hub.counts)) {
    hub.counts[key] = 0;
  }
}

function snapshot(event: string) {
  // ConversationList is not mounted by ThreadPanel, so it is always 0 here.
  const counts: Record<string, number> = { ConversationList: 0, ...hub.counts };
  console.log(JSON.stringify({ event, counts }));
  return counts;
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  hub.broadcast = [];
  hub.status = [];
  hub.presence = [];
  hub.change = [];
  reset();
  render(<App />);
  await flush();
  await flush();
  await act(async () => {
    hub.status.forEach((cb) => cb("SUBSCRIBED"));
  });
  await flush();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("chat render counts (baseline, 200-message thread)", () => {
  it("harness works: mount rendered 200 bubbles", () => {
    expect(hub.counts.ThreadPanel).toBeGreaterThan(0);
    expect(hub.counts.MessageTimeline).toBeGreaterThan(0);
    expect(hub.counts.MessageComposer).toBeGreaterThan(0);
    expect(hub.counts.MessageBubble).toBeGreaterThanOrEqual(200);
    snapshot("mount");
  });

  it("E1: peer typing.started then 4s expiry", async () => {
    expect(hub.broadcast.length).toBeGreaterThan(0);
    reset();
    await act(async () => {
      hub.broadcast.forEach((cb) => cb("typing.started", { conversationId: CONV, userId: PEER }));
    });
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    const counts = snapshot("E1 typing.started + 5s expiry");
    expect(counts.HeaderStatusView ?? 0).toBeGreaterThan(0);
  });

  it("E2: viewer types one keystroke", async () => {
    const box = screen.getByRole("textbox");
    reset();
    await act(async () => {
      fireEvent.change(box, { target: { value: "h" } });
    });
    await flush();
    const counts = snapshot("E2 composer keystroke");
    expect(counts.MessageComposer ?? 0).toBeGreaterThan(0);
  });

  it("E3: connection flip CHANNEL_ERROR -> SUBSCRIBED", async () => {
    expect(hub.status.length).toBeGreaterThan(0);
    reset();
    await act(async () => {
      hub.status.forEach((cb) => cb("CHANNEL_ERROR"));
    });
    await flush();
    await act(async () => {
      hub.status.forEach((cb) => cb("SUBSCRIBED"));
    });
    await flush();
    snapshot("E3 CHANNEL_ERROR -> SUBSCRIBED");
  });
});
