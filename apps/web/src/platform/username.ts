import { err, ok, type Result } from "@/platform/result";

export const RESERVED_USERNAMES = [
  "admin",
  "support",
  "pulse",
  "help",
  "system",
  "everyone",
  "here",
  "null",
  "undefined",
] as const;

const USERNAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function validateUsername(
  input: string,
): Result<{ display: string; normalized: string }> {
  const display = input.trim();
  const normalized = normalizeUsername(input);

  if (normalized.length < 3) {
    return err("identity.username_too_short");
  }
  if (normalized.length > 20) {
    return err("identity.username_too_long");
  }
  if (!/^[a-z]/.test(normalized)) {
    return err("identity.username_invalid_start");
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return err("identity.username_invalid_chars");
  }
  if ((RESERVED_USERNAMES as readonly string[]).includes(normalized)) {
    return err("identity.username_reserved");
  }

  return ok({ display, normalized });
}
