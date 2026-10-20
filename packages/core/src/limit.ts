import { callRpc, type RpcClient } from "./rpc";
import { err, ok, type Result } from "./result";

export const RATE_LIMITS = {
  send_message: { window: "minute" as const, max: 30 },
  search_users: { window: "minute" as const, max: 20 },
  create_conversation: { window: "minute" as const, max: 10 },
  submit_report: { window: "hour" as const, max: 5 },
  start_upload: { window: "hour" as const, max: 20 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Server-only: uses consume_rate_limit via a service-role RpcClient.
 */
export async function limit(
  client: RpcClient,
  input: { userId: string; action: RateLimitAction },
): Promise<Result<void>> {
  const result = await callRpc<boolean>(client, "consume_rate_limit", {
    p_user_id: input.userId,
    p_action: input.action,
  });

  if (!result.ok) {
    return result;
  }

  if (result.value) {
    return ok(undefined);
  }

  return err("platform.rate_limited");
}
