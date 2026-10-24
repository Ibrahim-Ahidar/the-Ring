import { callRpc, ok, type Result, type RpcClient } from "@pulse/core";

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

export type PendingDevice = {
  id: string;
  name: string;
  platform: string;
  identity_key: string;
  signing_key: string;
  created_at: string;
};

export type FreshDeviceOutcome = "registered" | "pending" | "replaced";
export type ApprovalStatus = "pending" | "approved" | "gone";

export type FreshDeviceInput = {
  deviceId: string;
  name: string;
  platform: string;
  identityKey: string;
  signingKey: string;
  accountSignature: string | null;
  accountSigningKey: string | null;
  lostDevices: boolean;
};

/** Registers a Fresh Device: registered, waiting for approval, or key replaced (spec 4.3). */
export function addFreshDevice(
  client: RpcClient,
  input: FreshDeviceInput,
): Promise<Result<FreshDeviceOutcome>> {
  return callRpc<FreshDeviceOutcome>(client, "add_fresh_device", {
    p_device_id: input.deviceId,
    p_name: input.name,
    p_platform: input.platform,
    p_identity_key: input.identityKey,
    p_signing_key: input.signingKey,
    p_account_signature: input.accountSignature,
    p_account_signing_key: input.accountSigningKey,
    p_lost_devices: input.lostDevices,
  });
}

/** "I lost my devices": new account key, version up, older devices signed out. */
export function replaceAccountKey(
  client: RpcClient,
  input: Omit<FreshDeviceInput, "lostDevices">,
): Promise<Result<FreshDeviceOutcome>> {
  return callRpc<FreshDeviceOutcome>(client, "replace_account_key", {
    p_device_id: input.deviceId,
    p_name: input.name,
    p_platform: input.platform,
    p_identity_key: input.identityKey,
    p_signing_key: input.signingKey,
    p_account_signature: input.accountSignature,
    p_account_signing_key: input.accountSigningKey,
  });
}

/** Pending requests; only an already approved device of the account sees any. */
export function listPendingDevices(client: RpcClient): Promise<Result<PendingDevice[]>> {
  return callRpc<PendingDevice[]>(client, "list_pending_devices", {});
}

export function approveDevice(
  client: RpcClient,
  deviceId: string,
  accountSignature: string,
): Promise<Result<null>> {
  return callRpc<null>(client, "approve_device", {
    p_device_id: deviceId,
    p_account_signature: accountSignature,
  });
}

export function denyDevice(client: RpcClient, deviceId: string): Promise<Result<null>> {
  return callRpc<null>(client, "deny_device", { p_device_id: deviceId });
}

export function deviceApprovalStatus(
  client: RpcClient,
  deviceId: string,
): Promise<Result<ApprovalStatus>> {
  return callRpc<ApprovalStatus>(client, "device_approval_status", { p_device_id: deviceId });
}

export function setDeviceApproval(client: RpcClient, required: boolean): Promise<Result<null>> {
  return callRpc<null>(client, "set_device_approval", { p_required: required });
}

export type AccountKeyVersion = { user_id: string; version: number };

export function accountKeyVersions(
  client: RpcClient,
  userIds: string[] | null,
): Promise<Result<AccountKeyVersion[]>> {
  return callRpc<AccountKeyVersion[]>(client, "account_key_versions", { p_user_ids: userIds });
}

export type OwnDevice = {
  id: string;
  name: string | null;
  platform: string;
  identity_key: string;
  signing_key: string;
  approval_status: ApprovalStatus;
};

/** This device's own row in any approval state (list_devices only shows approved ones). */
export async function getOwnDevice(
  client: RpcClient,
  deviceId: string,
): Promise<Result<OwnDevice | null>> {
  const res = await callRpc<OwnDevice[]>(client, "get_own_device", { p_device_id: deviceId });
  return res.ok ? ok(res.value[0] ?? null) : res;
}
