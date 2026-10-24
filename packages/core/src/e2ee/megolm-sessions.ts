import type { CryptoEngine } from "../crypto/crypto-engine";
import type { SessionKv } from "./olm-sessions";

/** Spec 5.4: the outbound session rotates after this many messages or this much time. */
export const MEGOLM_ROTATE_MESSAGES = 100;
export const MEGOLM_ROTATE_MS = 7 * 24 * 60 * 60 * 1000;
/** Spec 5.4: a group has at most this many members. */
export const MAX_GROUP_MEMBERS = 256;

type OutboundState = {
  sessionId: string;
  /** Key at index 0. A Device that joins later is never handed it (we rotate instead). */
  sessionKey: string;
  createdAt: number;
  count: number;
  /** Devices that were sent this session's key. */
  sharedWith: string[];
};

export type SendPlan = {
  sessionId: string;
  sessionKey: string;
  /** Devices that must be sent `sessionKey` before (or with) the next message. */
  shareWith: string[];
  rotated: boolean;
};

export type GroupSessionManager = {
  /**
   * Decides which outbound session the next message uses. Rotates when the roster lost a
   * Device (member left, Device removed), gained one after messages were sent (so it cannot
   * read the past), after 100 messages, or after 7 days.
   */
  prepareSend(conversationId: string, recipientDeviceIds: string[]): Promise<SendPlan>;
  /** Records that the key reached these Devices. */
  markShared(conversationId: string, sessionId: string, deviceIds: string[]): Promise<void>;
  /** Encrypts one plaintext with the current session and counts it toward rotation. */
  encrypt(conversationId: string, plaintext: string): Promise<{ sessionId: string; ciphertext: string }>;
  /** Stores the session key a Device shared for a group. */
  acceptSenderKey(
    senderDeviceId: string,
    conversationId: string,
    sessionId: string,
    sessionKey: string,
  ): Promise<boolean>;
  /** Decrypts a group ciphertext; throws when unknown, tampered, or for another sender/group. */
  decrypt(
    senderDeviceId: string,
    conversationId: string,
    sessionId: string,
    ciphertext: string,
  ): Promise<string>;
};

const OUT = (c: string) => `megolm.out.${c}`;
const IN = (sessionId: string) => `megolm.in.${sessionId}`;

export function createGroupSessionManager(opts: {
  engine: CryptoEngine;
  kv: SessionKv;
  persist(): Promise<void>;
  now?: () => number;
}): GroupSessionManager {
  const { engine, kv } = opts;
  const now = () => (opts.now ? opts.now() : Date.now());
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  async function load(c: string): Promise<OutboundState | null> {
    const raw = await kv.getKv(OUT(c));
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as OutboundState;
      return typeof o.sessionId === "string" && Array.isArray(o.sharedWith) ? o : null;
    } catch {
      return null;
    }
  }
  const save = (c: string, s: OutboundState) => kv.setKv(OUT(c), JSON.stringify(s));

  return {
    prepareSend(c, recipients) {
      return serial(async () => {
        const want = new Set(recipients);
        let st = await load(c);
        const lostDevice = st?.sharedWith.some((d) => !want.has(d)) ?? false;
        const gainedDevice = st ? st.count > 0 && recipients.some((d) => !st!.sharedWith.includes(d)) : false;
        const stale =
          !!st && (st.count >= MEGOLM_ROTATE_MESSAGES || now() - st.createdAt >= MEGOLM_ROTATE_MS);
        const rotate = !st || lostDevice || gainedDevice || stale;
        if (rotate) {
          const out = await engine.createOutboundGroupSession();
          st = {
            sessionId: out.sessionId,
            sessionKey: out.sessionKey,
            createdAt: now(),
            count: 0,
            sharedWith: [],
          };
          await save(c, st);
          await opts.persist();
        }
        const cur = st!;
        return {
          sessionId: cur.sessionId,
          sessionKey: cur.sessionKey,
          shareWith: recipients.filter((d) => !cur.sharedWith.includes(d)),
          rotated: rotate,
        };
      });
    },

    markShared(c, sessionId, deviceIds) {
      return serial(async () => {
        const st = await load(c);
        if (!st || st.sessionId !== sessionId) return;
        st.sharedWith = [...new Set([...st.sharedWith, ...deviceIds])];
        await save(c, st);
      });
    },

    encrypt(c, plaintext) {
      return serial(async () => {
        const st = await load(c);
        if (!st) throw new Error("e2ee.no_group_session");
        const ciphertext = await engine.groupEncrypt(st.sessionId, plaintext);
        st.count += 1;
        await save(c, st);
        await opts.persist();
        return { sessionId: st.sessionId, ciphertext };
      });
    },

    acceptSenderKey(senderDeviceId, c, sessionId, sessionKey) {
      return serial(async () => {
        if (await kv.getKv(IN(sessionId))) return false; // already known; never rebind
        let id: string;
        try {
          id = await engine.createInboundGroupSession(sessionKey);
        } catch {
          return false;
        }
        if (id !== sessionId) return false;
        await kv.setKv(IN(sessionId), JSON.stringify({ d: senderDeviceId, c }));
        await opts.persist();
        return true;
      });
    },

    decrypt(senderDeviceId, c, sessionId, ciphertext) {
      return serial(async () => {
        const raw = await kv.getKv(IN(sessionId));
        if (!raw) throw new Error("e2ee.no_group_key");
        const bound = JSON.parse(raw) as { d: string; c: string };
        if (bound.d !== senderDeviceId || bound.c !== c) throw new Error("e2ee.mismatch");
        const res = await engine.groupDecrypt(sessionId, ciphertext);
        await opts.persist();
        return res.plaintext;
      });
    },
  };
}
