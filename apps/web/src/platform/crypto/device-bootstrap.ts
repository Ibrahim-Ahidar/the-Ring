/**
 * Decides what this install's device is on start-up: ready, waiting for approval, or failed.
 * The identity (engine state) and the device id are persisted before anything can fail, so a
 * device that needs approval keeps the same keys and id until it is let in.
 */
import type { CryptoEngine, RpcClient } from "@pulse/core";

import { startFreshDevice } from "@/features/e2ee-devices/devices-changed";
import { deviceApprovalStatus } from "@/features/e2ee-devices/service";

import type { AccountKeyStore } from "./account-key";
import { DEVICE_ID_KV } from "./device-id";
import { registerThisDevice, topUpKeys, type DeviceInfo } from "./device-registration";

const APPROVAL_REQUIRED = "e2ee.approval_required";

export type BootResult =
  | { kind: "ready"; deviceId: string }
  | { kind: "pending"; deviceId: string }
  | { kind: "failed" };

export type BootDeps = {
  client: RpcClient;
  engine: CryptoEngine;
  store: {
    getKv(key: string): Promise<string | null>;
    setKv(key: string, value: string): Promise<void>;
  };
  accountKeys: AccountKeyStore;
  persist(): Promise<void>;
  /** Restores the sealed engine state; false when there is none. */
  load(): Promise<boolean>;
  info(deviceId: string): DeviceInfo;
  newId(): string;
};

export async function establishDevice(d: BootDeps): Promise<BootResult> {
  let deviceId = await d.store.getKv(DEVICE_ID_KV);
  // Loaded even without a device id, so an existing identity is reused (never re-created).
  const restored = await d.load();
  if (deviceId && restored) {
    const status = await deviceApprovalStatus(d.client, deviceId);
    if (status.ok && status.value === "pending") return { kind: "pending", deviceId };
    if (status.ok && status.value === "gone") deviceId = null;
  }
  if (deviceId && restored) {
    const topped = await topUpKeys(d.client, d.engine, deviceId);
    if (topped.ok) await d.persist();
    return { kind: "ready", deviceId };
  }

  const id = d.newId();
  const reg = await registerThisDevice(d.client, d.engine, d.info(id), d.accountKeys);
  if (reg.ok) {
    await d.persist();
    await d.store.setKv(DEVICE_ID_KV, id);
    return { kind: "ready", deviceId: id };
  }
  if (reg.error.code !== APPROVAL_REQUIRED) return { kind: "failed" };

  // Approval is required: keep the identity, create the pending row and report it.
  await d.persist();
  await d.store.setKv(DEVICE_ID_KV, id);
  const fresh = await startFreshDevice(d.client, d.engine, d.info(id), false, d.accountKeys, d.persist);
  if (!fresh.ok) return { kind: "failed" };
  return fresh.value === "pending" ? { kind: "pending", deviceId: id } : { kind: "ready", deviceId: id };
}
