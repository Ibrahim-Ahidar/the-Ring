import { err, ok, type CryptoEngine, type Result, type RpcClient } from "@pulse/core";
import { accountPublicKey, generateAccountSeed, signAsAccount } from "@pulse/core/linking";

import type { AccountKeyStore } from "@/platform/crypto/account-key";
import { ensureAccount, publishKeys } from "@/platform/crypto/device-registration";

import {
  addFreshDevice,
  approveDevice,
  deviceApprovalStatus,
  replaceAccountKey,
  type ApprovalStatus,
  type FreshDeviceOutcome,
  type PendingDevice,
} from "./service";

export const DEVICES_CHANGED_EVENT = "devices_changed";

export type DevicesChangeKind = "device_changed" | "security_code_changed";

export type DevicesChangedPayload = {
  userId: string;
  kind: DevicesChangeKind;
  /** Random id of the tab that made the change, so it does not alert itself. */
  origin: string;
  at: number;
};

/** Broadcast topic carrying one user's device-list changes. */
export function devicesTopic(userId: string): string {
  return `devices:${userId}`;
}

export function parseDevicesChanged(raw: unknown): DevicesChangedPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.userId !== "string" || p.userId === "") return null;
  if (p.kind !== "device_changed" && p.kind !== "security_code_changed") return null;
  return {
    userId: p.userId,
    kind: p.kind,
    origin: typeof p.origin === "string" ? p.origin : "",
    at: typeof p.at === "number" ? p.at : 0,
  };
}

/** What a contact's chat should say after a refresh: a bumped key version wins. */
export function classifyChange(
  before: number | undefined,
  after: number | undefined,
): "security_code_changed" | "new_device" {
  return before !== undefined && after !== undefined && after > before
    ? "security_code_changed"
    : "new_device";
}

type BroadcastChannel = {
  subscribe(cb?: (status: string) => void): unknown;
  send(msg: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
};
export type BroadcastClient = {
  channel(topic: string): BroadcastChannel;
  removeChannel(channel: unknown): unknown;
};

/** Sends one devices_changed event on the user's topic, then leaves the channel. */
export function announceDevicesChanged(
  client: BroadcastClient,
  payload: DevicesChangedPayload,
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = client.channel(devicesTopic(payload.userId));
    let settled = false;
    const finish = (sent: boolean) => {
      if (settled) return;
      settled = true;
      void client.removeChannel(channel);
      resolve(sent);
    };
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel
          .send({ type: "broadcast", event: DEVICES_CHANGED_EVENT, payload })
          .then(
            () => finish(true),
            () => finish(false),
          );
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        finish(false);
      }
    });
  });
}

export type FreshDeviceInfo = { deviceId: string; name: string; platform: string };

/** Creates this device's keys and asks the server what to do with it. */
export async function startFreshDevice(
  client: RpcClient,
  engine: CryptoEngine,
  info: FreshDeviceInfo,
  lostDevices: boolean,
  accountKeys: AccountKeyStore,
  persist: () => Promise<void> = async () => undefined,
): Promise<Result<FreshDeviceOutcome>> {
  const keys = await ensureAccount(engine);
  // A candidate Account Signing Key: kept only when this device ends up holding the account key.
  const seed = generateAccountSeed();
  const signature = signAsAccount(seed, keys.curve25519);
  const input = {
    deviceId: info.deviceId,
    name: info.name,
    platform: info.platform,
    identityKey: keys.curve25519,
    signingKey: keys.ed25519,
    accountSignature: signature,
    accountSigningKey: accountPublicKey(seed),
  };
  const res = lostDevices
    ? await replaceAccountKey(client, input)
    : await addFreshDevice(client, { ...input, lostDevices: false });
  // A "pending" device receives the seed later, through QR linking.
  if (!res.ok) return res;
  if (res.value !== "pending") await accountKeys.save(seed);
  // Keys are published for pending devices too: upload_keys only checks ownership, and the
  // approved device needs them to reach this one once it is allowed in.
  await persist();
  const published = await publishKeys(client, engine, info.deviceId);
  if (!published.ok) return err(published.error.code);
  await persist();
  return res;
}

/** An approved device signs the pending device's identity key and allows it. */
export async function allowPendingDevice(
  client: RpcClient,
  accountKeys: AccountKeyStore,
  pending: PendingDevice,
): Promise<Result<null>> {
  const seed = await accountKeys.load();
  if (!seed) return err("e2ee.no_account_key");
  const signature = signAsAccount(seed, pending.identity_key);
  return approveDevice(client, pending.id, signature);
}

export type WaitOptions = {
  intervalMs: number;
  maxPolls: number;
  sleep: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
};

/** Polls until the pending device is approved or gone. "pending" means we gave up. */
export async function waitForApproval(
  client: RpcClient,
  deviceId: string,
  opts: WaitOptions,
): Promise<Result<ApprovalStatus>> {
  for (let i = 0; i < opts.maxPolls; i += 1) {
    if (opts.isCancelled?.()) return ok("pending");
    const res = await deviceApprovalStatus(client, deviceId);
    if (!res.ok) return err(res.error.code);
    if (res.value !== "pending") return res;
    await opts.sleep(opts.intervalMs);
  }
  return ok("pending");
}
