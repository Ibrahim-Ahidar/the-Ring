/**
 * Browser runtime for end-to-end encryption (flag-gated): owns the vodozemac engine, this
 * Device's registration, the Olm session manager and the mailbox receiver that decrypts into
 * the local store. Built once per user; nothing here runs with the e2ee flag off.
 */
import { asRpcClient } from "@pulse/core/rpc";
import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import { createControlActions } from "@pulse/core/e2ee/control-actions";
import { claimKeysRpc, createControlSender } from "@pulse/core/e2ee/encrypted-sender";
import { createGroupSender } from "@pulse/core/e2ee/group-sender";
import { createGroupStateManager, type GroupStateManager } from "@pulse/core/e2ee/group-state";
import { createGroupSessionManager } from "@pulse/core/e2ee/megolm-sessions";
import { createOlmSessionManager, type OlmSessionManager } from "@pulse/core/e2ee/olm-sessions";
import { createEncryptedEnvelopeHandler } from "@pulse/core/e2ee/receive";
import type { RpcClient } from "@pulse/core/rpc";

import { createEncryptedTextSender, derivedId } from "@/features/direct-messaging/lib/mailbox-send";
import type { TextPayload } from "@/features/direct-messaging/lib/text-outbox";
import { startBrowserMailbox, type MailboxSubscription } from "@/platform/mailbox/device-channel";
import { getLocalStore } from "@/platform/local-store";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { registerThisDevice, topUpKeys } from "./device-registration";
import { loadEngineState, saveEngineState } from "./encrypted-state";
import { createCryptoEngine } from "./create-engine";
import { getLocalStorageKey } from "./local-key";
import { IdbCryptoStateStore } from "./state-store";

const DEVICE_ID_KV = "e2ee.device_id";

export type E2eeRuntime = {
  deviceId: string;
  sessions: OlmSessionManager;
  /** Encrypted Control Messages: react, edit, remove, pin, markRead, retry of failed sends. */
  actions: ReturnType<typeof createControlActions>;
  /** Encrypted groups (Megolm + group_state): send to a group and read its encrypted name. */
  groupSender: ReturnType<typeof createGroupSender>;
  groupState: GroupStateManager;
  sendText(input: TextPayload): ReturnType<ReturnType<typeof createEncryptedTextSender>>;
  stop(): void;
};

async function build(userId: string, client: RpcClient): Promise<E2eeRuntime | null> {
  const store = await getLocalStore();
  if (!store) return null;
  const engine = createCryptoEngine();
  const key = await getLocalStorageKey();
  const states = new IdbCryptoStateStore();
  const persist = () => saveEngineState(engine, states, key);

  let deviceId = await store.getKv(DEVICE_ID_KV);
  const restored = deviceId ? await loadEngineState(engine, states, key) : false;
  if (!deviceId || !restored) {
    deviceId = crypto.randomUUID();
    const reg = await registerThisDevice(client, engine, {
      deviceId,
      name: typeof navigator === "undefined" ? "Browser" : navigator.userAgent.slice(0, 60),
      platform: "web",
    });
    if (!reg.ok) return null;
    await persist();
    await store.setKv(DEVICE_ID_KV, deviceId);
  } else {
    const topped = await topUpKeys(client, engine, deviceId);
    if (topped.ok) await persist();
  }

  const sessions = createOlmSessionManager({
    engine,
    kv: store,
    claimKeys: (ids) => claimKeysRpc(client, ids),
    persist,
  });
  const sendControl = createControlSender({
    client,
    sessions,
    userId,
    deviceId,
    deriveId: derivedId,
    newId: () => crypto.randomUUID(),
  });
  const actions = createControlActions({
    store,
    selfUserId: userId,
    send: sendControl,
    newId: () => crypto.randomUUID(),
  });
  const groups = createGroupSessionManager({ engine, kv: store, persist });
  const groupState = createGroupStateManager({ client, kv: store });
  const groupSender = createGroupSender({
    client,
    sessions,
    groups,
    state: groupState,
    userId,
    deviceId,
    deriveId: derivedId,
    newId: () => crypto.randomUUID(),
  });
  const handler = createEncryptedEnvelopeHandler({
    sessions,
    groups,
    onStateKey: (c, k, v) => groupState.acceptKey(c, k, v),
    store,
    selfUserId: userId,
    sendControl,
  });
  void actions.flushPendingControls().catch(() => 0);
  const sub: MailboxSubscription = startBrowserMailbox(deviceId, handler);
  return {
    deviceId,
    sessions,
    actions,
    groupSender,
    groupState,
    sendText: createEncryptedTextSender({ client, sessions, userId, deviceId }),
    stop: () => sub.stop(),
  };
}

let current: { userId: string; promise: Promise<E2eeRuntime | null> } | null = null;

/** The runtime for this user, or null with the flag off / no local database. */
export function getE2eeRuntime(userId: string): Promise<E2eeRuntime | null> {
  if (!isE2eeEnabled() || typeof window === "undefined") return Promise.resolve(null);
  if (!current || current.userId !== userId) {
    current?.promise.then((r) => r?.stop());
    const client = asRpcClient(createSupabaseBrowserClient());
    const promise = build(userId, client).catch(() => null);
    current = { userId, promise };
  }
  return current.promise;
}

/** The already-started runtime of the signed-in user (null with the flag off or not started). */
export function getActiveE2eeRuntime(): Promise<E2eeRuntime | null> {
  if (!isE2eeEnabled()) return Promise.resolve(null);
  return current?.promise ?? Promise.resolve(null);
}

export function resetE2eeRuntime(): void {
  void current?.promise.then((r) => r?.stop());
  current = null;
}
