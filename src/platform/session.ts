import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cache } from "react";

import { asRpcClient, type RpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

export type SessionContext = {
  user: User;
  userId: string;
  supabase: SupabaseClient;
  rpc: RpcClient;
};

/**
 * The signed-in member for this request, or null when anonymous or when
 * Supabase is not configured. Cached per request.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await tryCreateSupabaseServerClient();
    if (!supabase) {
      return null;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return null;
      }
      return { user, userId: user.id, supabase, rpc: asRpcClient(supabase) };
    } catch {
      return null;
    }
  },
);
