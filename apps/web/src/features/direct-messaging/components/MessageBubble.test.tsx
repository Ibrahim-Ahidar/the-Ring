// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { MessageBubble } from "./MessageBubble";

vi.mock("@/shell/slots", () => ({ getContributions: () => [] }));
vi.mock("./MessageActionHost", () => ({ MessageActionHost: () => null }));
vi.mock("./MessageRendererHost", () => ({
  MessageRendererHost: ({ message }: { message: TimelineMessage }) => <p>{message.body}</p>,
}));

afterEach(cleanup);

function message(overrides: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: "sara",
    client_id: "k1",
    type: "text",
    body: "hello",
    reply_to_id: null,
    created_at: "2026-01-01T10:42:00.000Z",
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    ...overrides,
  } as TimelineMessage;
}

function renderBubble(
  props: Partial<React.ComponentProps<typeof MessageBubble>> = {},
  locale: "en" | "ar" = "en",
) {
  const messages = { "direct-messaging": locale === "en" ? en : ar };
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <MessageBubble
          message={message()}
          conversationId="c1"
          currentUserId="me"
          conversationType="group"
          grouped={false}
          senderName="Sara"
          {...props}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("MessageBubble sender attribution", () => {
  it("shows the sender name on the first incoming bubble of a group run", () => {
    renderBubble();
    expect(screen.getByText("Sara")).toBeTruthy();
    expect(screen.getByRole("article", { name: /^Sara, / })).toBeTruthy();
  });

  it("omits the name for grouped follow-ups but keeps the accessible name", () => {
    renderBubble({ grouped: true });
    expect(screen.queryByText("Sara")).toBeNull();
    expect(screen.getByRole("article", { name: /^Sara, / })).toBeTruthy();
  });

  it("announces own messages as You and shows no sender name", () => {
    renderBubble({ message: message({ sender_id: "me" }), senderName: null });
    expect(screen.getByRole("article", { name: /^You, / })).toBeTruthy();
  });

  it("shows no sender name in direct chats", () => {
    renderBubble({ conversationType: "direct", senderName: null });
    expect(screen.queryByText("Sara")).toBeNull();
  });

  it("renders the reply quote author", () => {
    renderBubble({ quoteText: "earlier", quoteAuthor: "Omar" });
    expect(screen.getByText("Omar")).toBeTruthy();
  });

  it("works under RTL with Arabic names", () => {
    renderBubble({ senderName: "سارة" }, "ar");
    expect(screen.getByText("سارة")).toBeTruthy();
    expect(screen.getByRole("article", { name: /^سارة, / })).toBeTruthy();
  });

  it("marks live bubbles with the enter marker only when live", () => {
    const { container } = renderBubble({ live: true });
    expect(container.querySelector("[data-live='true']")).not.toBeNull();
    cleanup();
    const plain = renderBubble({});
    expect(plain.container.querySelector("[data-live]")).toBeNull();
  });
});
