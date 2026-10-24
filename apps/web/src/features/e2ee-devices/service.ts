import { callRpc, type Result, type RpcClient } from "@pulse/core";

export type E2eeDevice = {
  id: string;
  user_id: string;
  name: string | null;
  platform: string;
  identity_key: string;
  signing_key: string;
  account_signature: string | null;
  created_at: string;
  last_seen_at: string | null;
  is_current_session: boolean;
};

/** The signed-in user's own devices, oldest first. */
export function listOwnDevices(client: RpcClient): Promise<Result<E2eeDevice[]>> {
  return callRpc<E2eeDevice[]>(client, "list_devices", {});
}

/** Removes a device: its keys are deleted and its session ends. */
export function removeDevice(client: RpcClient, deviceId: string): Promise<Result<null>> {
  return callRpc<null>(client, "remove_device", { p_device_id: deviceId });
}
