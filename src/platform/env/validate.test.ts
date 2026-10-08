import { describe, expect, it } from "vitest";

import { REQUIRED_ENV_KEYS, validateEnv } from "./validate";

describe("validateEnv", () => {
  it("returns no missing keys when all required variables are set", () => {
    const missing = validateEnv({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });

    expect(missing).toEqual([]);
  });

  it.each(REQUIRED_ENV_KEYS)("reports %s when it is missing", (key) => {
    const source: Record<string, string | undefined> = {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };
    delete source[key];

    const missing = validateEnv(source);
    expect(missing).toContain(key);
  });

  it.each(REQUIRED_ENV_KEYS)("reports %s when it is empty", (key) => {
    const source: Record<string, string | undefined> = {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      [key]: "   ",
    };

    const missing = validateEnv(source);
    expect(missing).toContain(key);
  });
});
