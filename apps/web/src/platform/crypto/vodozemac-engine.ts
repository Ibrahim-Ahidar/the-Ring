/**
 * CryptoEngine backed by vodozemac (WebAssembly, `@kinsh/vodozemac-wasm`). Runs on any
 * thread: the web client runs it inside a worker (see crypto.worker.ts); tests run it
 * directly under Node. No cryptography of our own: every primitive is vodozemac's or
 * WebCrypto's (spec D10). Ed25519 verification uses WebCrypto because the WASM package
 * exposes signing only.
 *
 * The pickles vodozemac produces here are plain JSON, so callers MUST encrypt the blob
 * from `pickle()` before it touches disk (see encrypted-state.ts).
 */
import type * as Vz from "@kinsh/vodozemac-wasm";
import type {
  CryptoEngine,
  GroupDecryption,
  IdentityKeys,
  InboundOlmSession,
  OlmMessage,
  OutboundGroupSession,
} from "@pulse/core";

export type VodozemacModule = typeof Vz;

const STATE_VERSION = 1;

type StateJson = {
  v: number;
  account: string | null;
  sessions: Record<string, string>;
  outbound: Record<string, string>;
  inbound: Record<string, string>;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Decodes base64 (padded or not). */
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `{ curve25519: { id: key } }` JSON from vodozemac -> flat id -> key record. */
function flatKeys(json: string): Record<string, string> {
  const parsed = JSON.parse(json) as { curve25519?: Record<string, string> };
  return { ...(parsed.curve25519 ?? {}) };
}

function pickleAll<T extends { pickle(): string }>(m: Map<string, T>): Record<string, string> {
  return Object.fromEntries([...m].map(([id, v]) => [id, v.pickle()]));
}

function loadAll<T>(rec: Record<string, string>, from: (p: string) => T): Map<string, T> {
  return new Map(Object.entries(rec).map(([id, p]) => [id, from(p)] as const));
}

export class VodozemacEngine implements CryptoEngine {
  private account: Vz.Account | null = null;
  private sessions = new Map<string, Vz.Session>();
  private outbound = new Map<string, Vz.GroupSession>();
  private inbound = new Map<string, Vz.InboundGroupSession>();

  constructor(private readonly vz: VodozemacModule) {}

  private acct(): Vz.Account {
    if (!this.account) throw new Error("crypto: no account");
    return this.account;
  }

  private session(id: string): Vz.Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error("crypto: unknown olm session");
    return s;
  }

  async createAccount(): Promise<IdentityKeys> {
    this.account ??= new this.vz.Account();
    return this.identityKeys();
  }

  async identityKeys(): Promise<IdentityKeys> {
    const k = JSON.parse(this.acct().identityKeys()) as IdentityKeys;
    return { curve25519: k.curve25519, ed25519: k.ed25519 };
  }

  async sign(message: string): Promise<string> {
    return this.acct().sign(message);
  }

  async generateOneTimeKeys(count: number): Promise<void> {
    this.acct().generateOneTimeKeys(count);
  }

  async oneTimeKeys(): Promise<Record<string, string>> {
    return flatKeys(this.acct().oneTimeKeys());
  }

  async generateFallbackKey(): Promise<void> {
    this.acct().generateFallbackKey();
  }

  async fallbackKey(): Promise<Record<string, string>> {
    return flatKeys(this.acct().fallbackKey());
  }

  async markKeysAsPublished(): Promise<void> {
    this.acct().markKeysAsPublished();
  }

  async createOutboundSession(theirIdentityKey: string, theirOneTimeKey: string): Promise<string> {
    const s = this.acct().createOutboundSession(theirIdentityKey, theirOneTimeKey);
    const id = s.sessionId();
    this.sessions.set(id, s);
    return id;
  }

  async createInboundSession(preKeyMessage: OlmMessage): Promise<InboundOlmSession> {
    if (preKeyMessage.type !== 0) throw new Error("crypto: not a pre-key message");
    const r = this.acct().createInboundSession(preKeyMessage.body);
    const session = r.takeSession();
    const sessionId = session.sessionId();
    this.sessions.set(sessionId, session);
    return { sessionId, plaintext: r.plaintext, senderIdentityKey: r.senderIdentityKey };
  }

  async encrypt(sessionId: string, plaintext: string): Promise<OlmMessage> {
    const m = JSON.parse(this.session(sessionId).encrypt(plaintext)) as { type: number; body: string };
    return { type: m.type === 0 ? 0 : 1, body: m.body };
  }

  async decrypt(sessionId: string, message: OlmMessage): Promise<string> {
    return this.session(sessionId).decrypt(message.type, message.body);
  }

  async createOutboundGroupSession(): Promise<OutboundGroupSession> {
    const g = new this.vz.GroupSession();
    const sessionId = g.sessionId();
    this.outbound.set(sessionId, g);
    return { sessionId, sessionKey: g.sessionKey() };
  }

  async groupEncrypt(sessionId: string, plaintext: string): Promise<string> {
    const g = this.outbound.get(sessionId);
    if (!g) throw new Error("crypto: unknown outbound group session");
    return g.encrypt(plaintext);
  }

  async createInboundGroupSession(sessionKey: string): Promise<string> {
    const g = new this.vz.InboundGroupSession(sessionKey);
    const id = g.sessionId();
    if (this.inbound.has(id)) g.free();
    else this.inbound.set(id, g);
    return id;
  }

  async groupDecrypt(sessionId: string, ciphertext: string): Promise<GroupDecryption> {
    const g = this.inbound.get(sessionId);
    if (!g) throw new Error("crypto: unknown inbound group session");
    const r = JSON.parse(g.decrypt(ciphertext)) as GroupDecryption;
    return { plaintext: r.plaintext, messageIndex: r.messageIndex };
  }

  async verify(ed25519Key: string, message: string, signature: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey("raw", fromB64(ed25519Key), { name: "Ed25519" }, false, [
        "verify",
      ]);
      return await crypto.subtle.verify({ name: "Ed25519" }, key, fromB64(signature), enc.encode(message));
    } catch {
      return false;
    }
  }

  async pickle(): Promise<Uint8Array> {
    const state: StateJson = {
      v: STATE_VERSION,
      account: this.account ? this.account.pickle() : null,
      sessions: pickleAll(this.sessions),
      outbound: pickleAll(this.outbound),
      inbound: pickleAll(this.inbound),
    };
    return enc.encode(JSON.stringify(state));
  }

  async unpickle(blob: Uint8Array): Promise<void> {
    const state = JSON.parse(dec.decode(blob)) as StateJson;
    if (state.v !== STATE_VERSION) throw new Error("crypto: unsupported state version");
    this.account = state.account ? this.vz.Account.fromPickle(state.account) : null;
    this.sessions = loadAll(state.sessions, (p) => this.vz.Session.fromPickle(p));
    this.outbound = loadAll(state.outbound, (p) => this.vz.GroupSession.fromPickle(p));
    this.inbound = loadAll(state.inbound, (p) => this.vz.InboundGroupSession.fromPickle(p));
  }
}
