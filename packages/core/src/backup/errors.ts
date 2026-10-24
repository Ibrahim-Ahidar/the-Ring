export type BackupErrorCode =
  /** Passphrase or recovery key does not open the backup. */
  | "wrong_secret"
  /** The secret itself is unusable (empty passphrase, recovery key not 64 digits). */
  | "invalid_secret"
  /** The file ends early: a chunk is missing or the final chunk is absent. */
  | "truncated"
  /** A chunk or the header failed authentication, or the structure is invalid. */
  | "corrupt"
  /** Not a Pulse backup, or a version this build does not know. */
  | "unsupported";

/** Typed failure for every backup read problem, so the UI never has to catch a crash. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(code: BackupErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BackupError";
    this.code = code;
  }
}
