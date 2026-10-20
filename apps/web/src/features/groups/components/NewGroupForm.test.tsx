// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { createGroupAction } from "../actions";
import { NewGroupForm } from "./NewGroupForm";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../actions", () => ({
  createGroupAction: vi.fn(),
  uploadGroupAvatarAction: vi.fn(),
}));

const createGroup = vi.mocked(createGroupAction);

function renderEn() {
  render(
    <NextIntlClientProvider locale="en" messages={{ groups: en }}>
      <NewGroupForm />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Friends" },
  });
  fireEvent.change(screen.getByLabelText("Add members (optional)"), {
    target: { value: "@bob, carol bob" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
}

describe("NewGroupForm", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockReset();
    createGroup.mockReset();
  });

  it("renders the Arabic name field with an accessible label", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ groups: ar }}>
        <NewGroupForm />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("اسم المجموعة")).toBeTruthy();
  });

  it("sends the listed members with the create request and opens the chat", async () => {
    createGroup.mockResolvedValue({
      ok: true,
      value: { conversationId: "g1", failedInvites: [] },
    });
    renderEn();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/chats/g1"));
    expect(createGroup).toHaveBeenCalledWith({
      name: "Friends",
      description: null,
      members: ["bob", "carol"],
    });
  });

  it("names members that could not be added and does not create the group twice", async () => {
    createGroup.mockResolvedValue({
      ok: true,
      value: {
        conversationId: "g2",
        failedInvites: [{ username: "carol", code: "groups.not_allowed" }],
      },
    });
    renderEn();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("@carol");
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open group" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/chats/g2"));
    expect(createGroup).toHaveBeenCalledTimes(1);
  });
});
