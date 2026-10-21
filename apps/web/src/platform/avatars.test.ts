import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_BYTES,
  avatarObjectName,
  checkAvatarFile,
  resolveAvatarSrc,
} from "./avatars";

const UID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const PATH = `avatars/${UID}/1a2b3c4d-0000-4000-8000-000000000000.png`;
const SUPABASE = "https://proj.supabase.co/";

describe("resolveAvatarSrc", () => {
  it("maps stored avatar paths to the public avatars bucket URL", () => {
    expect(resolveAvatarSrc(PATH, SUPABASE)).toBe(
      `https://proj.supabase.co/storage/v1/object/public/${PATH}`,
    );
  });

  it("passes absolute and preview URLs through", () => {
    expect(resolveAvatarSrc("https://cdn.test/a.png", SUPABASE)).toBe(
      "https://cdn.test/a.png",
    );
    expect(resolveAvatarSrc("blob:http://localhost/abc", SUPABASE)).toBe(
      "blob:http://localhost/abc",
    );
  });

  it("returns null for empty, foreign or unresolvable values", () => {
    expect(resolveAvatarSrc(null, SUPABASE)).toBeNull();
    expect(resolveAvatarSrc("", SUPABASE)).toBeNull();
    expect(resolveAvatarSrc(`group-avatars/${UID}/x.png`, SUPABASE)).toBeNull();
    expect(resolveAvatarSrc(`avatars/${UID}/../secret`, SUPABASE)).toBeNull();
    expect(resolveAvatarSrc(PATH, undefined)).toBeNull();
  });
});

describe("avatarObjectName", () => {
  it("strips the bucket prefix", () => {
    expect(avatarObjectName(PATH)).toBe(PATH.slice("avatars/".length));
    expect(avatarObjectName("attachments/x.png")).toBeNull();
  });
});

describe("checkAvatarFile", () => {
  it("rejects unsupported types and oversized or empty files", () => {
    expect(checkAvatarFile({ type: "image/svg+xml", size: 10 })).toBe(
      "unsupported_type",
    );
    expect(checkAvatarFile({ type: "application/pdf", size: 10 })).toBe(
      "unsupported_type",
    );
    expect(checkAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).toBe(
      "too_large",
    );
    expect(checkAvatarFile({ type: "image/png", size: 0 })).toBe("empty");
  });

  it("accepts supported images within the limit", () => {
    expect(checkAvatarFile({ type: "image/jpeg", size: AVATAR_MAX_BYTES })).toBeNull();
    expect(checkAvatarFile({ type: "image/webp", size: 1024 })).toBeNull();
  });
});
