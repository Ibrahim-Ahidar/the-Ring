// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fr from "../messages/fr.json";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import type { OwnProfile } from "../types";
import { AccountSettings } from "./AccountSettings";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const uploadAvatarAction = vi.fn();
const removeAvatarAction = vi.fn();
const changeUsernameAction = vi.fn();
const deleteAccountAction = vi.fn();
const updateProfileAction = vi.fn();
vi.mock("../actions", () => ({
  uploadAvatarAction: (...args: unknown[]) => uploadAvatarAction(...args),
  removeAvatarAction: (...args: unknown[]) => removeAvatarAction(...args),
  changeUsernameAction: (...args: unknown[]) => changeUsernameAction(...args),
  deleteAccountAction: (...args: unknown[]) => deleteAccountAction(...args),
  exportDataAction: vi.fn(),
  updateProfileAction: (...args: unknown[]) => updateProfileAction(...args),
}));

const MB = 1024 * 1024;
const UID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function profile(overrides: Partial<OwnProfile> = {}): OwnProfile {
  return {
    id: UID,
    username: "layla",
    display_name: "Layla",
    bio: null,
    avatar_url: null,
    timezone: "UTC",
    username_changed_at: null,
    locale: "en",
    ...overrides,
  };
}

function renderSettings(
  value: OwnProfile,
  locale: "en" | "ar" | "fr" = "en",
) {
  const messages = locale === "ar" ? ar : locale === "fr" ? fr : en;
  return render(
    <div dir={locale === "ar" ? "rtl" : "ltr"}>
      <NextIntlClientProvider locale={locale} messages={{ identity: messages }}>
        <AccountSettings profile={value} />
      </NextIntlClientProvider>
    </div>,
  );
}

function makeFile(type: string, size: number, name = "photo.png"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function pick(file: File) {
  const input = document.getElementById("account-avatar") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  refresh.mockReset();
  uploadAvatarAction.mockReset();
  removeAvatarAction.mockReset();
  changeUsernameAction.mockReset();
  deleteAccountAction.mockReset();
  updateProfileAction.mockReset();
});

describe("AccountSettings avatar", () => {
  it("renders a stored avatar path as the public bucket image", () => {
    const path = `avatars/${UID}/a.png`;
    const { container } = renderSettings(profile({ avatar_url: path }));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      `https://proj.supabase.co/storage/v1/object/public/${path}`,
    );
  });

  it("rejects oversized files with the size limit before uploading", () => {
    renderSettings(profile());
    pick(makeFile("image/png", 9 * MB));

    expect(screen.getByRole("alert").textContent).toBe(
      "This photo is 9.0 MB. Choose one that is 8 MB or smaller.",
    );
    expect(uploadAvatarAction).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before uploading", () => {
    renderSettings(profile());
    pick(makeFile("image/svg+xml", 1024, "logo.svg"));

    expect(screen.getByRole("alert").textContent).toContain(
      "This file type isn't supported",
    );
    expect(uploadAvatarAction).not.toHaveBeenCalled();
  });

  it("previews, uploads and refreshes so every surface picks up the photo", async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    uploadAvatarAction.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const { container } = renderSettings(profile());

    pick(makeFile("image/png", 2 * MB));

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:http://localhost/preview",
    );
    expect(screen.getByRole("status").textContent).toContain("Uploading photo");
    expect(uploadAvatarAction).toHaveBeenCalledTimes(1);
    const formData = uploadAvatarAction.mock.calls[0]![0] as FormData;
    expect(formData.get("avatar")).toBeInstanceOf(File);

    await act(async () => {
      resolveUpload({ ok: true, value: undefined });
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Photo updated")).toBeTruthy();
  });

  it("drops the preview and shows the server error when the upload fails", async () => {
    uploadAvatarAction.mockResolvedValue({
      ok: false,
      error: { code: "identity.avatar_rejected" },
    });
    const { container } = renderSettings(profile());

    await act(async () => {
      pick(makeFile("image/png", 1024));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "Choose a supported image within the size limit.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes the photo and refreshes", async () => {
    removeAvatarAction.mockResolvedValue({ ok: true, value: undefined });
    const { container } = renderSettings(
      profile({ avatar_url: `avatars/${UID}/a.png` }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    });

    expect(removeAvatarAction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  it("hides the remove action when there is no photo", () => {
    renderSettings(profile());
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  it("renders the Arabic avatar controls and size error in RTL", () => {
    const { container } = renderSettings(
      profile({ avatar_url: `avatars/${UID}/a.png` }),
      "ar",
    );
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("رفع صورة")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إزالة الصورة" })).toBeTruthy();

    pick(makeFile("image/png", 9 * MB));
    expect(screen.getByRole("alert").textContent).toBe(
      "حجم هذه الصورة 9.0 ميغابايت. اختر صورة لا يتجاوز حجمها 8 ميغابايت.",
    );
    expect(uploadAvatarAction).not.toHaveBeenCalled();
  });
});

describe("AccountSettings cards", () => {
  it("shows feedback inside the card and keeps other cards enabled while saving", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    updateProfileAction.mockReturnValue(new Promise((r) => (resolveSave = r)));
    renderSettings(profile());

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: "Working…" })).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Change username" }),
    ).toHaveProperty("disabled", false);

    await act(async () => {
      resolveSave({ ok: true, value: undefined });
    });
    const status = screen.getByText("Profile saved");
    expect(status.closest("form")?.querySelector("#account-bio")).not.toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports a username change with the next allowed date", async () => {
    changeUsernameAction.mockResolvedValue({ ok: true, value: undefined });
    renderSettings(profile());
    fireEvent.change(document.getElementById("account-username")!, {
      target: { value: "layla2" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change username" }));
    });
    expect(screen.queryByText("Profile saved")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(
      /^Username changed\. You can change it again on .+\d{4}\.$/,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the real next allowed date from username_changed_at", () => {
    const changed = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    renderSettings(profile({ username_changed_at: changed }));
    expect(screen.getByText(/You can change your username again on/)).toBeTruthy();
  });

  it("shows a bio counter", () => {
    renderSettings(profile({ bio: "hello" }));
    expect(screen.getByText("5 / 160")).toBeTruthy();
  });

  it("offers timezone choices in ar and fr", () => {
    for (const locale of ["ar", "fr"] as const) {
      renderSettings(profile({ timezone: "Africa/Casablanca" }), locale);
      const input = document.getElementById("account-timezone") as HTMLInputElement;
      expect(input.value).toBe("Africa/Casablanca");
      expect(document.querySelectorAll("#account-timezone-list option").length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("disables export with a coming soon tag", () => {
    renderSettings(profile());
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request export" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps delete disabled until @username matches, then asks to confirm", async () => {
    deleteAccountAction.mockResolvedValue({ ok: true, value: undefined });
    renderSettings(profile());
    const button = screen.getByRole("button", { name: "Delete my account" });
    const input = document.getElementById("delete-confirm")!;
    expect(button).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "layla" } });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "@layla" } });
    expect(button).toHaveProperty("disabled", false);

    fireEvent.click(button);
    expect(deleteAccountAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("cannot be undone");

    await act(async () => {
      const confirm = Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Delete my account",
      )!;
      fireEvent.click(confirm);
    });
    expect(deleteAccountAction).toHaveBeenCalledWith("layla");
  });
});
