// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { MessageComposer, type ComposerDisabledReason } from "./MessageComposer";

const sendMessage = vi.fn();
const setDraft = vi.fn();
let draft = "";
let activityListener: ((a: unknown) => void) | null = null;

vi.mock("../context/MessagingProvider", () => ({
  useMessagingActions: () => ({ sendMessage, setDraft }),
  useDraft: () => draft,
}));
let sendActions: unknown[] = [];
vi.mock("@/shell/slots", () => ({
  getContributions: (kind: string) => (kind === "composerSendAction" ? sendActions : []),
}));
vi.mock("@/platform/composer-events", () => ({
  emitComposerActivity: vi.fn(),
  onComposerActivity: (l: (a: unknown) => void) => {
    activityListener = l;
    return () => {};
  },
  getComposerSendExtras: () => undefined,
  composerAboveId: (id: string) => `above-${id}`,
}));

function setup(locale: "en" | "ar" = "en", disabledReason?: ComposerDisabledReason) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ "direct-messaging": locale === "ar" ? ar : en }}
    >
      <MessageComposer conversationId="c1" disabledReason={disabledReason} />
    </NextIntlClientProvider>,
  );
}

function coarse(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: matches && q.includes("coarse"),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  draft = "";
  sendActions = [];
  coarse(false);
});

describe("MessageComposer", () => {
  it("sends on Enter but not on Shift+Enter", () => {
    draft = "hello";
    coarse(false);
    setup();
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("never sends on Enter during IME composition", () => {
    draft = "nihao";
    coarse(false);
    setup();
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("inserts a newline instead of sending on coarse pointers", () => {
    draft = "hello";
    coarse(true);
    setup();
    const proceeded = fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(proceeded).toBe(true); // default not prevented
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("disables send when the draft is empty or whitespace", () => {
    draft = "   ";
    setup();
    expect((screen.getByRole("button", { name: en.send }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("enables send for a non-empty draft", () => {
    draft = "hi";
    setup();
    expect((screen.getByRole("button", { name: en.send }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("uses dir=auto on the textarea", () => {
    setup("ar");
    expect(screen.getByRole("textbox").getAttribute("dir")).toBe("auto");
  });

  it("shows a reason and disables input when the user cannot post (Arabic)", () => {
    draft = "hi";
    setup("ar", "blocked");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(ar.composerDisabled.blocked);
    expect((screen.getByRole("button", { name: ar.send }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows the contributed action when empty and the send arrow when typed", () => {
    sendActions = [{ id: "x", Component: () => <button type="button">MicStub</button> }];
    const view = setup();
    expect(screen.getByText("MicStub")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    view.unmount();
    draft = "hi";
    setup();
    expect(screen.queryByText("MicStub")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("hides the textarea while recording", () => {
    sendActions = [{ id: "x", Component: () => <button type="button">MicStub</button> }];
    setup();
    act(() => activityListener?.({ kind: "recording", conversationId: "c1", active: true }));
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => activityListener?.({ kind: "recording", conversationId: "c1", active: false }));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
