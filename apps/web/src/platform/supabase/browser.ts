import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/platform/env/public";

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
