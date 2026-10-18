// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThreadPage } from "../lib/streamed-pages";
import type { ConversationDetail } from "../types";

const nav = vi.hoisted(() => ({ pathname: "/app/chats/a", sidebarMounts: 0, panelMounts: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/shell/components/ErrorScreen", () => ({ ErrorScreen: () => <p>error</p> }));
vi.mock("@/platform/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({}) }));
const channel = vi.hoisted(() => () => ({
  onBroadcast: () => () => {},
  onPresence: () => () => {},
  onStatus: () => () => {},
  onChange: () => () => {},
  send: async () => {},
  track: async () => {},
  untrack: async () => {},
  leave: () => {},
}));
vi.mock("@/platform/realtime-hub", () => ({
  joinConversation: channel,
  joinInbox: channel,
}));
vi.mock("@/features/media/actions", () => ({ getMessageAttachmentsAction: vi.fn() }));
vi.mock("../actions", () => ({
  getConversationAction: vi.fn(async () => ({ ok: false, error: { code: "x" } })),
  getConversationReceiptsAction: vi.fn(async () => ({ ok: true, value: {} })),
  markDeliveredAction: vi.fn(async () => ({ ok: true, value: null })),
  getArchivedSummaryAction: vi.fn(async () => ({ ok: true, value: { count: 0, unread: 0 } })),
  listConversationsAction: vi.fn(async () => ({ ok: true, value: { items: [], hasMore: false } })),
  listMessagesAction: vi.fn(async () => ({ ok: true, value: { items: [], hasMore: false } })),
  markReadAction: vi.fn(),
  sendTextAction: vi.fn(),
}));

function Mounted({ name, children }: { name: "sidebarMounts" | "panelMounts"; children?: ReactNode }) {
  useEffect(() => {
    nav[name] += 1;
  }, [name]);
  return <div data-testid={name}>{children}</div>;
}
vi.mock("./ChatsSidebar", () => ({
  ChatsSidebar: ({ activeConversationId }: { activeConversationId?: string }) => (
    <Mounted name="sidebarMounts">{activeConversationId}</Mounted>
  ),
}));
vi.mock("./ThreadPanel", () => ({
  ThreadPanel: ({ conversationId }: { conversationId: string }) => (
    <Mounted name="panelMounts">thread-{conversationId}</Mounted>
  ),
}));
vi.mock("./ChatsWelcome", () => ({ ChatsWelcome: () => <p>welcome</p> }));
vi.mock("./ConversationDrawer", () => ({ ConversationDrawer: () => null }));
vi.mock("./Skeletons", () => ({ ThreadSkeleton: () => <p>skeleton</p> }));

import { MessagingProvider } from "../context/MessagingProvider";
import { ChatsShell } from "./ChatsShell";
import { ThreadSeed } from "./StreamSeeders";

function detail(id: string): ConversationDetail {
  return { id, type: "direct" } as unknown as ConversationDetail;
}

/** A resolved promise that counts how often it is read. */
function countedThread(): { promise: Promise<ThreadPage>; reads: () => number } {
  let reads = 0;
  const inner = Promise.resolve<ThreadPage>({ ok: true, items: [], hasMore: false });
  const promise = {
    then: (...args: Parameters<typeof inner.then>) => {
      reads += 1;
      return inner.then(...args);
    },
  } as Promise<ThreadPage>;
  return { promise, reads: () => reads };
}

const threads: Record<string, ReturnType<typeof countedThread>> = {};

function Tree() {
  const id = nav.pathname.split("/")[3];
  if (id) {
    threads[id] ??= countedThread();
  }
  return (
    <MessagingProvider userId="me">
      <ChatsShell userId="me" viewer={null} inbox={Promise.resolve({ items: [], hasMore: false })}>
        {id ? (
          <ThreadSeed conversationId={id} detail={detail(id)} thread={threads[id].promise} />
        ) : null}
      </ChatsShell>
    </MessagingProvider>
  );
}

async function go(path: string, view: ReturnType<typeof render>) {
  nav.pathname = path;
  await act(async () => {
    view.rerender(<Tree />);
  });
}

describe("ChatsShell", () => {
  beforeEach(() => {
    nav.pathname = "/app/chats/a";
    nav.sidebarMounts = 0;
    nav.panelMounts = 0;
    for (const key of Object.keys(threads)) {
      delete threads[key];
    }
  });
  afterEach(cleanup);

  it("keeps the sidebar mounted and revisits a seen thread without reading it again", async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<Tree />);
    });
    expect(screen.getByText("thread-a")).toBeTruthy();

    await go("/app/chats/b", view);
    expect(screen.getByText("thread-b")).toBeTruthy();
    const readsOfA = threads.a.reads();

    await go("/app/chats/a", view);
    expect(screen.getByText("thread-a")).toBeTruthy();

    // The sidebar never remounted; the revisited thread was not read again.
    expect(nav.sidebarMounts).toBe(1);
    expect(threads.a.reads()).toBe(readsOfA);
  });

  it("shows the welcome pane on the list route without remounting the sidebar", async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<Tree />);
    });
    await go("/app/chats", view);
    expect(screen.getByText("welcome")).toBeTruthy();
    expect(nav.sidebarMounts).toBe(1);
  });
});
