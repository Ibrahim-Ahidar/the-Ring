import type { CryptoEngine, OlmMessage } from "../crypto/crypto-engine";
import { ok, type Result } from "../result";

/** What claim_keys returns for one device, mapped to camelCase. */
export type ClaimedKey = { deviceId: string; identityKey: string; oneTimeKey: string };

export type SessionKv = {
  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string): Promise<void>;
};

export type OlmSessionManagerOptions = {
  engine: CryptoEngine;
  /** Maps device id -> session ids. Lives in the LocalStore kv table. */
  kv: SessionKv;
  /** Claims one one-time key per device; devices that no longer exist are simply absent. */
  claimKeys(deviceIds: string[]): Promise<Result<ClaimedKey[]>>;
  /** Saves the engine state (pickled, encrypted) after every change to sessions. */
  persist(): Promise<void>;
};

export type OlmSessionManager = {
  /**
   * Encrypts one plaintext for each device, reusing sessions and claiming one-time keys only
   * for devices without one. Devices with no keys (removed) are left out of the result.
   */
  encryptForDevices(
    plaintext: string,
    deviceIds: string[],
  ): Promise<Result<Map<string, OlmMessage>>>;
  /** Decrypts a message from a device; creates the inbound session for a pre-key message. */
  decryptFrom(senderDeviceId: string, message: OlmMessage): Promise<string>;
};

const KEY = (deviceId: string) => `olm.sessions.${deviceId}`;

export function createOlmSessionManager(opts: OlmSessionManagerOptions): OlmSessionManager {
  const { engine, kv } = opts;
  const cache = new Map<string, string[]>();
  let chain: Promise<unknown> = Promise.resolve();

  // Ratchet state must change one operation at a time.
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  async function sessionsOf(deviceId: string): Promise<string[]> {
    const hit = cache.get(deviceId);
    if (hit) return hit;
    const raw = await kv.getKv(KEY(deviceId));
    let ids: string[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      ids = [];
    }
    cache.set(deviceId, ids);
    return ids;
  }

  async function remember(deviceId: string, sessionId: string): Promise<void> {
    const ids = [sessionId, ...(await sessionsOf(deviceId)).filter((s) => s !== sessionId)];
    cache.set(deviceId, ids);
    await kv.setKv(KEY(deviceId), JSON.stringify(ids));
  }

  return {
    encryptForDevices(plaintext, deviceIds) {
      return serial(async () => {
        const out = new Map<string, OlmMessage>();
        const missing: string[] = [];
        for (const id of deviceIds) {
          if ((await sessionsOf(id)).length === 0) missing.push(id);
        }
        if (missing.length > 0) {
          const claimed = await opts.claimKeys(missing);
          if (!claimed.ok) return claimed;
          for (const c of claimed.value) {
            const sid = await engine.createOutboundSession(c.identityKey, c.oneTimeKey);
            await remember(c.deviceId, sid);
          }
        }
        for (const id of deviceIds) {
          const [sid] = await sessionsOf(id);
          if (!sid) continue; // no keys: the device was removed
          out.set(id, await engine.encrypt(sid, plaintext));
        }
        await opts.persist();
        return ok(out);
      });
    },

    decryptFrom(senderDeviceId, message) {
      return serial(async () => {
        let plaintext: string | null = null;
        for (const sid of await sessionsOf(senderDeviceId)) {
          try {
            plaintext = await engine.decrypt(sid, message);
            break;
          } catch {
            // Not this session; try the next, then (for a pre-key message) a new one.
          }
        }
        if (plaintext === null) {
          if (message.type !== 0) throw new Error("e2ee.no_session");
          const inbound = await engine.createInboundSession(message);
          await remember(senderDeviceId, inbound.sessionId);
          plaintext = inbound.plaintext;
        }
        // Outside the try: a failed save must surface, not look like a bad session.
        await opts.persist();
        return plaintext;
      });
    },
  };
}
