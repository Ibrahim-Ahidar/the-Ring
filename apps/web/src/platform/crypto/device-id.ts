/** The one source of this browser's E2EE device id: the runtime's local key-value entry. */
import { getLocalStore } from "@/platform/local-store";

export const DEVICE_ID_KV = "e2ee.device_id";

/** This browser's device id, or null before the runtime has registered one. */
export async function readDeviceId(): Promise<string | null> {
  const store = await getLocalStore();
  return store ? store.getKv(DEVICE_ID_KV) : null;
}

/** This browser's device id, created and stored in the same KV entry the runtime uses. */
export async function ensureDeviceId(): Promise<string> {
  const store = await getLocalStore();
  if (!store) throw new Error("no local store");
  const existing = await store.getKv(DEVICE_ID_KV);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await store.setKv(DEVICE_ID_KV, created);
  return created;
}
