import { asRpcClient, callRpc, type Result } from "@pulse/core";

import { supabase } from "./client";

/** RpcClient for the shared @pulse/core services, built from the Supabase client. */
export const rpcClient = asRpcClient(supabase);

export function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  return callRpc<T>(rpcClient, fn, args);
}
