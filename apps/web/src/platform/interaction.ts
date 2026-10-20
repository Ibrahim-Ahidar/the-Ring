import { callRpc, type RpcClient } from "@pulse/core/rpc";
import type { Result } from "@pulse/core/result";

export type InteractionAction = "discover" | "message" | "invite" | "presence";
export type InteractionDecision = "allow" | "request" | "deny";

export async function decideInteraction(
  client: RpcClient,
  actorId: string,
  targetId: string,
  action: InteractionAction,
): Promise<Result<InteractionDecision>> {
  return callRpc<InteractionDecision>(client, "decide_interaction", {
    p_actor: actorId,
    p_target: targetId,
    p_action: action,
  });
}
