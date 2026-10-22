import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

import { createChunkedStorage } from "./secure-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy apps/mobile/.env.example to .env.",
  );
}

/** The one Supabase client. Only files in src/data may import it. */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: createChunkedStorage(SecureStore),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Cookie-less twin used only to check a password without replacing the signed-in session. */
export const statelessSupabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
