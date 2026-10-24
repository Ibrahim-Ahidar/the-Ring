export type LinkErrorCode =
  | "invalid_qr"
  | "bad_frame"
  | "replay"
  | "auth"
  | "wrong_device"
  | "declined"
  | "timeout"
  | "protocol"
  | "history";

export class LinkError extends Error {
  readonly code: LinkErrorCode;
  constructor(code: LinkErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LinkError";
    this.code = code;
  }
}
