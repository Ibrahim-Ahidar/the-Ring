// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../actions", () => ({
  uploadAvatarAction: (...args: unknown[]) => uploadAvatarAction(...args),
  removeAvatarAction: (...args: unknown[]) => removeAvatarAction(...args),
  changeUsernameAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  exportDataAction: vi.fn(),
  updateProfileAction: vi.fn(),
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
  locale: "en" | "ar" = "en",
) {
  const messages = locale === "ar" ? ar : en;
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
