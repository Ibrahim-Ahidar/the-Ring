import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

export function hasSupabaseEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && serviceKey);
}

function requireSupabaseEnv() {
  if (!hasSupabaseEnv()) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

export function adminClient(): SupabaseClient {
  const { supabaseUrl, supabaseServiceRoleKey } = requireSupabaseEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type HarnessUser = {
  id: string;
  username: string;
  client: SupabaseClient;
};

export async function createUser(options: {
  username: string;
  password?: string;
}): Promise<HarnessUser> {
  const { supabaseUrl, supabaseServiceRoleKey, supabaseAnonKey } =
    requireSupabaseEnv();
  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY for sign-in client");
  }

  const password = options.password ?? "PulseTest123!";
  const email = `${options.username}@pulse.test`;

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Failed to create auth user");
  }

  const id = created.data.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id,
    username: options.username,
  });
  if (profileError) {
    throw profileError;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: true, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    throw signedIn.error;
  }

  return { id, username: options.username, client };
}

/**
 * Resets the local Supabase database (`npx supabase db reset`).
 * Requires the Supabase CLI local stack to be running.
 */
export function resetDatabase(): void {
  const status = spawnSync("npx", ["supabase", "status"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const running =
    status.status === 0 &&
    (status.stdout.includes("API URL") || status.stdout.includes("Running"));
  if (!running) {
    throw new Error(
      "Local Supabase stack is not running. Start it with `npx supabase start`, then run `npx supabase db reset`.",
    );
  }

  const reset = spawnSync("npx", ["supabase", "db", "reset"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (reset.status !== 0) {
    throw new Error("supabase db reset failed");
  }
}
