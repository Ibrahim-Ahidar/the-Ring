// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import type { ChatFolder } from "../types";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  search: "",
}));
const actions = vi.hoisted(() => ({
  deleteFolderAction: vi.fn(async () => ({ ok: true as const, value: undefined })),
  reorderFoldersAction: vi.fn(async () => ({ ok: true as const, value: [] })),
  renameFolderAction: vi.fn(),
  createFolderAction: vi.fn(),
}));
const dialog = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => "/app/chats",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("../actions", () => actions);
vi.mock("../organization-events", () => ({
  requestFolderDialog: dialog.request,
}));

import { FolderStrip } from "./FolderStrip";

const folders: ChatFolder[] = [
  { id: "f1", name: "Work", position: 0 },
  { id: "f2", name: "Family", position: 1 },
  { id: "f3", name: "Friends", position: 2 },
];

function renderStrip(
  props: { folders?: ChatFolder[]; onFoldersChanged?: () => void } = {},
  locale: "en" | "ar" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ "conversation-organization": locale === "ar" ? ar : en }}
    >
      <FolderStrip folders={props.folders ?? folders} onFoldersChanged={props.onFoldersChanged} />
    </NextIntlClientProvider>,
  );
}

function pressedLabels(): (string | null)[] {
  return screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent);
}

beforeEach(() => {
  nav.search = "";
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("FolderStrip", () => {
  it("renders All, Unread, Groups, the folders by position, then the add button", () => {
    renderStrip({ folders: [folders[2]!, folders[0]!, folders[1]!] });
    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent || button.getAttribute("aria-label"));
    expect(labels).toEqual(["All", "Unread", "Groups", "Work", "Family", "Friends", "Create folder"]);
  });

  it("has no Archived chip, no All chats chip and no always-on empty hint", () => {
    renderStrip({ folders: [] });
    expect(screen.queryByText("Archived")).toBeNull();
    expect(screen.queryByText("All chats")).toBeNull();
    expect(screen.queryByText(/Create a folder to group/)).toBeNull();
    expect(screen.queryByText(/folder is empty/i)).toBeNull();
  });

  it("marks exactly one chip active", () => {
    nav.search = "filter=unread";
    renderStrip();
    expect(pressedLabels()).toEqual(["Unread"]);
  });

  it("marks All active by default and the folder chip for ?folder", () => {
    renderStrip();
    expect(pressedLabels()).toEqual(["All"]);
    cleanup();
    nav.search = "folder=f2";
    renderStrip();
    expect(pressedLabels()).toEqual(["Family"]);
  });

  it("clears the other params when a chip is picked", () => {
    nav.search = "folder=f1&archived=1&info=1";
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(nav.push).toHaveBeenLastCalledWith("/app/chats?info=1&filter=unread");
    fireEvent.click(screen.getByRole("button", { name: "Family" }));
    expect(nav.push).toHaveBeenLastCalledWith("/app/chats?info=1&folder=f2");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(nav.push).toHaveBeenLastCalledWith("/app/chats?info=1");
  });

  it("shows accessible folder control in Arabic when there are no folders", () => {
    renderStrip({ folders: [] }, "ar");
    expect(screen.getByRole("toolbar", { name: "مجلدات المحادثات" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء مجلد" })).toBeTruthy();
  });
});

describe("folder chip menu", () => {
  function openMenu(name = "Family") {
    fireEvent.contextMenu(screen.getByRole("button", { name }));
    return screen.getByRole("dialog");
  }

  it("opens on right-click with Rename, Delete, Move left and Move right", () => {
    renderStrip();
    openMenu();
    for (const label of ["Rename folder", "Delete folder", "Move left", "Move right"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("opens from the keyboard with the context-menu key and Shift+F10", () => {
    renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "Work" }), { key: "ContextMenu" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "Work" }), { key: "F10", shiftKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens on long-press for touch pointers without selecting the folder", () => {
    vi.useFakeTimers();
    try {
      renderStrip();
      const chip = screen.getByRole("button", { name: "Family" });
      fireEvent.pointerDown(chip, { pointerType: "touch" });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      fireEvent.pointerUp(chip, { pointerType: "touch" });
      fireEvent.click(chip);
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(nav.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Rename opens the folder dialog in rename mode", () => {
    renderStrip();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Rename folder" }));
    expect(dialog.request).toHaveBeenCalledWith({
      kind: "rename",
      folderId: "f2",
      currentName: "Family",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Move right swaps the folder with its right neighbour", async () => {
    const onChanged = vi.fn();
    renderStrip({ onFoldersChanged: onChanged });
    openMenu("Family");
    fireEvent.click(screen.getByRole("button", { name: "Move right" }));
    await waitFor(() =>
      expect(actions.reorderFoldersAction).toHaveBeenCalledWith(["f1", "f3", "f2"]),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("Move left swaps with the left neighbour and is disabled at the edge", async () => {
    renderStrip();
    openMenu("Work");
    expect(
      (screen.getByRole("button", { name: "Move left" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    cleanup();
    renderStrip();
    openMenu("Family");
    fireEvent.click(screen.getByRole("button", { name: "Move left" }));
    await waitFor(() =>
      expect(actions.reorderFoldersAction).toHaveBeenCalledWith(["f2", "f1", "f3"]),
    );
  });

  it("Delete asks for confirmation and then deletes only the folder", async () => {
    const onChanged = vi.fn();
    renderStrip({ onFoldersChanged: onChanged });
    openMenu("Family");
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(actions.deleteFolderAction).not.toHaveBeenCalled();
    expect(screen.getByText(/not archived or deleted/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(actions.deleteFolderAction).toHaveBeenCalledWith("f2"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("Cancel in the delete confirmation deletes nothing", () => {
    renderStrip();
    openMenu("Family");
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.deleteFolderAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rename folder" })).toBeTruthy();
  });

  it("returns to All after deleting the active folder", async () => {
    nav.search = "folder=f2";
    renderStrip();
    openMenu("Family");
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(nav.push).toHaveBeenLastCalledWith("/app/chats"));
  });
});
