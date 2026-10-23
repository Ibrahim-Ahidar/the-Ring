/**
 * The one seam for end-to-end encryption (spec D10, 6.1). Platform-neutral and async.
 * Web and Desktop implement it with vodozemac WebAssembly in a worker; Mobile implements
 * it with a native vodozemac module. All binary values travel as base64/unpadded-base64
 * strings (the vodozemac wire forms); plaintexts are UTF-8 strings.
 */

export type IdentityKeys = {
  /** Curve25519 identity key (Olm). */
  curve25519: string;
  /** Ed25519 signing key (Megolm message signatures, device signatures). */
  ed25519: string;
};

/** An Olm message. `type` 0 is a pre-key message, 1 a normal message. */
export type OlmMessage = { type: 0 | 1; body: string };

export type OutboundGroupSession = {
  sessionId: string;
  /** Export of the ratchet; shared with other devices over Olm. */
  sessionKey: string;
};

export type GroupDecryption = { plaintext: string; messageIndex: number };

export type InboundOlmSession = {
  sessionId: string;
  plaintext: string;
  /** Curve25519 identity key of the sender, taken from the pre-key message. */
  senderIdentityKey: string;
};

export interface CryptoEngine {
  // --- Account (device identity and key upload) ---

  /** Creates the account if none exists, and returns its identity keys. Idempotent. */
  createAccount(): Promise<IdentityKeys>;
  identityKeys(): Promise<IdentityKeys>;
  /** Signs a UTF-8 message with the account's Ed25519 key; returns unpadded base64. */
  sign(message: string): Promise<string>;
  generateOneTimeKeys(count: number): Promise<void>;
  /** Unpublished one-time keys: key id -> Curve25519 public key. */
  oneTimeKeys(): Promise<Record<string, string>>;
  generateFallbackKey(): Promise<void>;
  /** Unpublished fallback key: key id -> Curve25519 public key (empty if none). */
  fallbackKey(): Promise<Record<string, string>>;
  markKeysAsPublished(): Promise<void>;

  // --- Olm (1:1 device sessions) ---

  createOutboundSession(theirIdentityKey: string, theirOneTimeKey: string): Promise<string>;
  /** Consumes the one-time key the pre-key message used. Returns the session and plaintext. */
  createInboundSession(preKeyMessage: OlmMessage): Promise<InboundOlmSession>;
  encrypt(sessionId: string, plaintext: string): Promise<OlmMessage>;
  /** Rejects when the message is tampered with or not for this session. */
  decrypt(sessionId: string, message: OlmMessage): Promise<string>;

  // --- Megolm (groups) ---

  createOutboundGroupSession(): Promise<OutboundGroupSession>;
  groupEncrypt(sessionId: string, plaintext: string): Promise<string>;
  /** Returns the inbound session id (equal to the sender's outbound session id). */
  createInboundGroupSession(sessionKey: string): Promise<string>;
  /** Rejects when the ciphertext is tampered with or the index is not known. */
  groupDecrypt(sessionId: string, ciphertext: string): Promise<GroupDecryption>;

  // --- Signatures ---

  /** Verifies an Ed25519 signature made by `sign`. Never throws on a bad signature. */
  verify(ed25519Key: string, message: string, signature: string): Promise<boolean>;

  // --- State ---

  /** Serializes the whole state (account, sessions, group sessions) for storage. */
  pickle(): Promise<Uint8Array>;
  /** Replaces the state with one produced by `pickle`. */
  unpickle(state: Uint8Array): Promise<void>;
}

/** Name -> blob store for encrypted crypto state. Compatible with LocalStore `crypto_state`. */
export interface CryptoStateStore {
  get(name: string): Promise<Uint8Array | undefined>;
  put(name: string, blob: Uint8Array): Promise<void>;
  delete(name: string): Promise<void>;
}
