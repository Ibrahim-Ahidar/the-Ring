import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/platform/env/server";

export function createSupabaseAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getServerEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
