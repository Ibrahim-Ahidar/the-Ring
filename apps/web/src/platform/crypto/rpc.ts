/**
 * Worker RPC for the CryptoEngine. `serveCryptoEngine` runs inside the worker (or any
 * message port); `WorkerCryptoEngine` is the main-thread proxy implementing CryptoEngine.
 */
import type {
  CryptoEngine,
  GroupDecryption,
  IdentityKeys,
  InboundOlmSession,
  OlmMessage,
  OutboundGroupSession,
} from "@pulse/core";

export type RpcRequest = { id: number; method: string; args: unknown[] };
export type RpcResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

/** The subset of Worker / DedicatedWorkerGlobalScope both sides use. */
export type MessagePortLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: { data: unknown }) => void): void;
};

const METHODS = [
  "createAccount",
  "identityKeys",
  "sign",
  "generateOneTimeKeys",
  "oneTimeKeys",
  "generateFallbackKey",
  "fallbackKey",
  "markKeysAsPublished",
  "createOutboundSession",
  "createInboundSession",
  "encrypt",
  "decrypt",
  "createOutboundGroupSession",
  "groupEncrypt",
  "createInboundGroupSession",
  "groupDecrypt",
  "verify",
  "pickle",
  "unpickle",
] as const satisfies readonly (keyof CryptoEngine)[];

type Method = (typeof METHODS)[number];

export function serveCryptoEngine(engine: CryptoEngine, port: MessagePortLike): void {
  port.addEventListener("message", (e) => {
    const req = e.data as RpcRequest;
    void (async () => {
      let res: RpcResponse;
      try {
        if (!(METHODS as readonly string[]).includes(req.method)) {
          throw new Error("unknown method");
        }
        const fn = engine[req.method as Method] as (...a: unknown[]) => Promise<unknown>;
        res = { id: req.id, ok: true, value: await fn.apply(engine, req.args) };
      } catch (err) {
        res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      port.postMessage(res);
    })();
  });
}

export class WorkerCryptoEngine implements CryptoEngine {
  private nextId = 1;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();

  constructor(private readonly port: MessagePortLike) {
    port.addEventListener("message", (e) => {
      const res = e.data as RpcResponse;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.value);
      else p.reject(new Error(res.error));
    });
  }

  private call<T>(method: Method, ...args: unknown[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.port.postMessage({ id, method, args } satisfies RpcRequest);
    });
  }

  createAccount() {
    return this.call<IdentityKeys>("createAccount");
  }
  identityKeys() {
    return this.call<IdentityKeys>("identityKeys");
  }
  sign(message: string) {
    return this.call<string>("sign", message);
  }
  generateOneTimeKeys(count: number) {
    return this.call<void>("generateOneTimeKeys", count);
  }
  oneTimeKeys() {
    return this.call<Record<string, string>>("oneTimeKeys");
  }
  generateFallbackKey() {
    return this.call<void>("generateFallbackKey");
  }
  fallbackKey() {
    return this.call<Record<string, string>>("fallbackKey");
  }
  markKeysAsPublished() {
    return this.call<void>("markKeysAsPublished");
  }
  createOutboundSession(theirIdentityKey: string, theirOneTimeKey: string) {
    return this.call<string>("createOutboundSession", theirIdentityKey, theirOneTimeKey);
  }
  createInboundSession(preKeyMessage: OlmMessage) {
    return this.call<InboundOlmSession>("createInboundSession", preKeyMessage);
  }
  encrypt(sessionId: string, plaintext: string) {
    return this.call<OlmMessage>("encrypt", sessionId, plaintext);
  }
  decrypt(sessionId: string, message: OlmMessage) {
    return this.call<string>("decrypt", sessionId, message);
  }
  createOutboundGroupSession() {
    return this.call<OutboundGroupSession>("createOutboundGroupSession");
  }
  groupEncrypt(sessionId: string, plaintext: string) {
    return this.call<string>("groupEncrypt", sessionId, plaintext);
  }
  createInboundGroupSession(sessionKey: string) {
    return this.call<string>("createInboundGroupSession", sessionKey);
  }
  groupDecrypt(sessionId: string, ciphertext: string) {
    return this.call<GroupDecryption>("groupDecrypt", sessionId, ciphertext);
  }
  verify(ed25519Key: string, message: string, signature: string) {
    return this.call<boolean>("verify", ed25519Key, message, signature);
  }
  pickle() {
    return this.call<Uint8Array>("pickle");
  }
  unpickle(state: Uint8Array) {
    return this.call<void>("unpickle", state);
  }
}
