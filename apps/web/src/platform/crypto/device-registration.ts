/**
 * Client side of the device registry (issue #223): registers this device and keeps its
 * pool of one-time keys topped up. Works against any CryptoEngine and RpcClient.
 */
import { callRpc, err, ok, type CryptoEngine, type Result, type RpcClient } from "@pulse/core";

/** Keep this many one-time keys on the server. */
export const ONE_TIME_KEY_TARGET = 50;
/** Top up when fewer than this many remain. */
export const ONE_TIME_KEY_LOW_WATER = 10;

export type DeviceInfo = { deviceId: string; name: string; platform: string };

async function uploadFresh(
  client: RpcClient,
  engine: CryptoEngine,
  deviceId: string,
  count: number,
  withFallback: boolean,
): Promise<Result<number>> {
  await engine.generateOneTimeKeys(count);
  if (withFallback) await engine.generateFallbackKey();
  const oneTimeKeys = await engine.oneTimeKeys();
  const fallback = withFallback ? await engine.fallbackKey() : {};
  const res = await callRpc<number>(client, "upload_keys", {
    p_device_id: deviceId,
    p_one_time_keys: oneTimeKeys,
    p_fallback_key: Object.keys(fallback).length > 0 ? fallback : null,
  });
  if (!res.ok) return res;
  // Only after the server accepted them, so a failed upload is retried with the same keys.
  await engine.markKeysAsPublished();
  return ok(res.value);
}

/** Tops the server's one-time key pool up to the target when it runs below the low-water mark. */
export async function topUpKeys(
  client: RpcClient,
  engine: CryptoEngine,
  deviceId: string,
): Promise<Result<number>> {
  const counted = await callRpc<number>(client, "one_time_key_count", { p_device_id: deviceId });
  if (!counted.ok) return counted;
  if (counted.value >= ONE_TIME_KEY_LOW_WATER) return ok(counted.value);
  return uploadFresh(client, engine, deviceId, ONE_TIME_KEY_TARGET - counted.value, false);
}

/** Registers this device (idempotent) and publishes its first keys. */
export async function registerThisDevice(
  client: RpcClient,
  engine: CryptoEngine,
  info: DeviceInfo,
): Promise<Result<number>> {
  const keys = await engine.createAccount();
  const signature = await engine.sign(keys.curve25519);
  const reg = await callRpc<null>(client, "register_device", {
    p_device_id: info.deviceId,
    p_name: info.name,
    p_platform: info.platform,
    p_identity_key: keys.curve25519,
    p_signing_key: keys.ed25519,
    p_account_signature: signature,
    p_account_signing_key: keys.ed25519,
  });
  if (!reg.ok) return err(reg.error.code);
  const counted = await callRpc<number>(client, "one_time_key_count", { p_device_id: info.deviceId });
  if (!counted.ok) return counted;
  return uploadFresh(client, engine, info.deviceId, ONE_TIME_KEY_TARGET - counted.value, true);
}
