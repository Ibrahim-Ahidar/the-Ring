import type { SupabaseClient } from "@supabase/supabase-js";

import { err, ok, type Result } from "./result";

const FEATURE_ERROR = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;

export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; details?: string; hint?: string } | null;
    status?: number;
  }>;
}

export function mapRpcError(message: string, pgCode?: string): string {
  if (FEATURE_ERROR.test(message)) {
    return message;
  }
  if (pgCode === "42501") {
    return "platform.forbidden";
  }
  if (pgCode === "23505") {
    return "platform.conflict";
  }
  return "platform.unexpected";
}

export async function callRpc<T>(
  client: RpcClient,
  fn: string,
  args?: Record<string, unknown>,
  options?: { quiet?: boolean },
): Promise<Result<T>> {
  const { data, error, status } = await client.rpc(fn, args);
  if (error) {
    const code = mapRpcError(error.message, error.code);
    if (code === "platform.unexpected") {
      // The mapped code hides the cause; keep it visible in server logs. A
      // gateway or network failure carries no pgCode/message, so log it all.
      // Quiet calls are best-effort background work that retries on its own.
      const log = options?.quiet ? console.warn : console.error;
      log(`[rpc] ${fn} failed`, {
        status,
        pgCode: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    return err(code);
  }
  return ok(data as T);
}

export function asRpcClient(supabase: SupabaseClient): RpcClient {
  return {
    rpc(fn, args) {
      return supabase.rpc(fn, args ?? {});
    },
  };
}
