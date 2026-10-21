import { hasSupabaseEnv } from "../../tests/harness/supabase";

// Journeys need a running local Supabase (Auth, Realtime, Mailpit) plus the app.
export const journeysEnabled =
  Boolean(process.env.E2E_SUPABASE) && hasSupabaseEnv();

export const SKIP_REASON =
  "Requires E2E_SUPABASE=1 with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointing at a local Supabase (supabase start)";

export const MAIL_URL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54324";
export const TEST_PASSWORD = "PulseTest123!";

// Unique, valid username (3-20 chars, starts with a letter).
export function uniqueName(prefix: string): string {
  const stamp = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${prefix}_${stamp}${rand}`.slice(0, 20);
}
