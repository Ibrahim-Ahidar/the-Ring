// JS layer over the native Vodozemac module (Android). Handle based: the native side keeps the
// vodozemac objects, JS keeps string handles. Binary values cross the bridge as base64.
// Shape mirrors the planned CryptoEngine (account, Olm sessions, Megolm sessions, pickle);
// the adapter that implements CryptoEngine on top of this lives with #222/#223.

export interface IdentityKeys {
  ed25519: string;
  curve25519: string;
}
export interface OlmCiphertext {
  /** 0 = pre-key message, 1 = normal message */
  type: number;
  body: string;
}

/** The raw native surface (what VodozemacModule.kt exports). */
export interface NativeVodozemac {
  release(handle: string): void;
  accountNew(): Promise<string>;
  accountFromPickle(pickle: string, keyB64: string): Promise<string>;
  accountPickle(h: string, keyB64: string): Promise<string>;
  accountIdentityKeys(h: string): Promise<IdentityKeys>;
  accountSign(h: string, messageB64: string): Promise<string>;
  accountGenerateOneTimeKeys(h: string, count: number): Promise<void>;
  accountOneTimeKeys(h: string): Promise<string[]>;
  accountMarkKeysAsPublished(h: string): Promise<void>;
  accountCreateOutboundSession(h: string, idKey: string, otk: string): Promise<string>;
  accountCreateInboundSession(
    h: string,
    idKey: string,
    type: number,
    body: string,
  ): Promise<{ session: string; plaintext: string }>;
  sessionFromPickle(pickle: string, keyB64: string): Promise<string>;
  sessionPickle(h: string, keyB64: string): Promise<string>;
  sessionId(h: string): Promise<string>;
  sessionEncrypt(h: string, plaintextB64: string): Promise<OlmCiphertext>;
  sessionDecrypt(h: string, type: number, body: string): Promise<string>;
  groupNew(): Promise<string>;
  groupFromPickle(pickle: string, keyB64: string): Promise<string>;
  groupPickle(h: string, keyB64: string): Promise<string>;
  groupSessionId(h: string): Promise<string>;
  groupSessionKey(h: string): Promise<string>;
  groupEncrypt(h: string, plaintextB64: string): Promise<string>;
  inboundNew(sessionKey: string): Promise<string>;
  inboundFromPickle(pickle: string, keyB64: string): Promise<string>;
  inboundPickle(h: string, keyB64: string): Promise<string>;
  inboundSessionId(h: string): Promise<string>;
  inboundDecrypt(h: string, message: string): Promise<{ plaintext: string; messageIndex: number }>;
}

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export class OlmSession {
  constructor(
    private readonly n: NativeVodozemac,
    readonly handle: string,
  ) {}
  sessionId() {
    return this.n.sessionId(this.handle);
  }
  encrypt(plaintext: Uint8Array): Promise<OlmCiphertext> {
    return this.n.sessionEncrypt(this.handle, toB64(plaintext));
  }
  async decrypt(message: OlmCiphertext): Promise<Uint8Array> {
    return fromB64(await this.n.sessionDecrypt(this.handle, message.type, message.body));
  }
  pickle(key: Uint8Array) {
    return this.n.sessionPickle(this.handle, toB64(key));
  }
  free() {
    this.n.release(this.handle);
  }
}

export class OlmAccount {
  constructor(
    private readonly n: NativeVodozemac,
    readonly handle: string,
  ) {}
  identityKeys() {
    return this.n.accountIdentityKeys(this.handle);
  }
  async sign(message: Uint8Array) {
    return this.n.accountSign(this.handle, toB64(message));
  }
  generateOneTimeKeys(count: number) {
    return this.n.accountGenerateOneTimeKeys(this.handle, count);
  }
  oneTimeKeys() {
    return this.n.accountOneTimeKeys(this.handle);
  }
  markKeysAsPublished() {
    return this.n.accountMarkKeysAsPublished(this.handle);
  }
  async createOutboundSession(theirIdentityKey: string, theirOneTimeKey: string) {
    return new OlmSession(
      this.n,
      await this.n.accountCreateOutboundSession(this.handle, theirIdentityKey, theirOneTimeKey),
    );
  }
  async createInboundSession(theirIdentityKey: string, message: OlmCiphertext) {
    const r = await this.n.accountCreateInboundSession(
      this.handle,
      theirIdentityKey,
      message.type,
      message.body,
    );
    return { session: new OlmSession(this.n, r.session), plaintext: fromB64(r.plaintext) };
  }
  pickle(key: Uint8Array) {
    return this.n.accountPickle(this.handle, toB64(key));
  }
  free() {
    this.n.release(this.handle);
  }
}

export class MegolmOutbound {
  constructor(
    private readonly n: NativeVodozemac,
    readonly handle: string,
  ) {}
  sessionId() {
    return this.n.groupSessionId(this.handle);
  }
  sessionKey() {
    return this.n.groupSessionKey(this.handle);
  }
  encrypt(plaintext: Uint8Array) {
    return this.n.groupEncrypt(this.handle, toB64(plaintext));
  }
  pickle(key: Uint8Array) {
    return this.n.groupPickle(this.handle, toB64(key));
  }
  free() {
    this.n.release(this.handle);
  }
}

export class MegolmInbound {
  constructor(
    private readonly n: NativeVodozemac,
    readonly handle: string,
  ) {}
  sessionId() {
    return this.n.inboundSessionId(this.handle);
  }
  async decrypt(message: string) {
    const r = await this.n.inboundDecrypt(this.handle, message);
    return { plaintext: fromB64(r.plaintext), messageIndex: r.messageIndex };
  }
  pickle(key: Uint8Array) {
    return this.n.inboundPickle(this.handle, toB64(key));
  }
  free() {
    this.n.release(this.handle);
  }
}

export function createVodozemac(n: NativeVodozemac) {
  return {
    newAccount: async () => new OlmAccount(n, await n.accountNew()),
    accountFromPickle: async (pickle: string, key: Uint8Array) =>
      new OlmAccount(n, await n.accountFromPickle(pickle, toB64(key))),
    sessionFromPickle: async (pickle: string, key: Uint8Array) =>
      new OlmSession(n, await n.sessionFromPickle(pickle, toB64(key))),
    newGroupSession: async () => new MegolmOutbound(n, await n.groupNew()),
    groupSessionFromPickle: async (pickle: string, key: Uint8Array) =>
      new MegolmOutbound(n, await n.groupFromPickle(pickle, toB64(key))),
    newInboundGroupSession: async (sessionKey: string) =>
      new MegolmInbound(n, await n.inboundNew(sessionKey)),
    inboundGroupSessionFromPickle: async (pickle: string, key: Uint8Array) =>
      new MegolmInbound(n, await n.inboundFromPickle(pickle, toB64(key))),
  };
}

export type Vodozemac = ReturnType<typeof createVodozemac>;

let cached: Vodozemac | undefined;
/** The real module. Throws in Expo Go / web, where the native module does not exist. */
export function getVodozemac(): Vodozemac {
  if (!cached) {
    // Lazy require so that importing this file in Jest or Expo Go does not throw.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require("expo-modules-core");
    cached = createVodozemac(requireNativeModule("Vodozemac") as NativeVodozemac);
  }
  return cached;
}
