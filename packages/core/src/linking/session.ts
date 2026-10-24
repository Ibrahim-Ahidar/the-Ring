import { ed25519 } from "@noble/curves/ed25519";

import type { LocalStore } from "../local-store";
import { fromB64, toB64, utf8 } from "./bytes";
import {
  createEphemeralKey,
  createLinkChannel,
  type LinkChannel,
  parseLinkFrame,
  type LinkFrame,
  type LinkTransport,
} from "./channel";
import { LinkError } from "./errors";
import {
  ARCHIVE_THRESHOLD_BYTES,
  type ArchiveRef,
  type ArchiveStorage,
  downloadArchive,
  type HistoryRecord,
  importHistoryChunk,
  planHistory,
  uploadArchive,
  validateHistoryRecords,
} from "./history";
import { encodeLinkQr, type LinkQr, newLinkNonce, requireLinkQr } from "./qr";

export type LinkProgress = { phase: "history"; done: number; total: number };

export type LinkedDeviceInfo = {
  deviceId: string;
  name: string;
  platform: string;
  identityKey: string;
  signingKey: string;
};

type ToNew =
  | { t: "account_key"; seed: string }
  | {
      t: "history_begin";
      records: number;
      messages: number;
      chunks: number;
      mode: "chunks" | "archive";
    }
  | { t: "history_chunk"; i: number; records: HistoryRecord[] }
  | { t: "history_archive"; ref: ArchiveRef }
  | { t: "history_end" }
  | { t: "abort"; reason: string };

type ToExisting =
  | { t: "device"; info: LinkedDeviceInfo }
  | { t: "device_signature"; signature: string };

const MAX_RECORDS = 10_000_000;
const MAX_CHUNKS = 100_000;
const MAX_CHUNK_RECORDS = 20_000;

function protocol(what: string): never {
  throw new LinkError("protocol", what);
}
function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    return protocol("not an object");
  return v as Record<string, unknown>;
}
function text(o: Record<string, unknown>, k: string, max = 2048): string {
  const v = o[k];
  if (typeof v !== "string" || v.length > max) return protocol(k);
  return v;
}
function count(o: Record<string, unknown>, k: string, max: number): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    return protocol(k);
  return v;
}
function b64Bytes(o: Record<string, unknown>, k: string, len: number): string {
  const v = text(o, k, 128);
  try {
    if (fromB64(v).length !== len) return protocol(k);
  } catch {
    return protocol(k);
  }
  return v;
}

/** Runtime check of a decrypted frame from the existing Device. Throws LinkError("protocol"). */
export function parseToNew(value: unknown): ToNew {
  const m = rec(value);
  switch (m.t) {
    case "account_key":
      return { t: "account_key", seed: b64Bytes(m, "seed", 32) };
    case "history_begin": {
      const records = count(m, "records", MAX_RECORDS);
      const messages = count(m, "messages", MAX_RECORDS);
      const chunks = count(m, "chunks", MAX_CHUNKS);
      if (messages > records || (m.mode !== "chunks" && m.mode !== "archive")) {
        return protocol("history_begin");
      }
      return { t: "history_begin", records, messages, chunks, mode: m.mode };
    }
    case "history_chunk": {
      const i = count(m, "i", MAX_CHUNKS);
      if (!Array.isArray(m.records) || m.records.length > MAX_CHUNK_RECORDS) {
        return protocol("records");
      }
      return { t: "history_chunk", i, records: m.records as HistoryRecord[] };
    }
    case "history_archive": {
      const r = rec(m.ref);
      return {
        t: "history_archive",
        ref: {
          location: text(r, "location"),
          key: b64Bytes(r, "key", 32),
          size: count(r, "size", 2 ** 40),
          sha256: text(r, "sha256", 128),
        },
      };
    }
    case "history_end":
      return { t: "history_end" };
    case "abort":
      return { t: "abort", reason: text(m, "reason", 200) };
    default:
      return protocol("unknown frame");
  }
}

/** Runtime check of a decrypted frame from the new Device. Throws LinkError("protocol"). */
export function parseToExisting(value: unknown): ToExisting {
  const m = rec(value);
  if (m.t === "device") {
    const i = rec(m.info);
    return {
      t: "device",
      info: {
        deviceId: text(i, "deviceId", 200),
        name: text(i, "name", 200),
        platform: text(i, "platform", 50),
        identityKey: text(i, "identityKey", 200),
        signingKey: text(i, "signingKey", 200),
      },
    };
  }
  if (m.t === "device_signature") {
    return { t: "device_signature", signature: b64Bytes(m, "signature", 64) };
  }
  return protocol("unknown frame");
}

/** Pull-style inbox over a transport so the flows read top to bottom. */
function inbox(transport: LinkTransport, timeoutMs: number) {
  const queue: LinkFrame[] = [];
  let wake: (() => void) | null = null;
  const unsub = transport.subscribe((raw) => {
    const f = parseLinkFrame(raw);
    if (!f || queue.length >= 1000) return; // junk and floods never reach the protocol
    queue.push(f);
    wake?.();
  });
  return {
    close: unsub,
    async next(): Promise<LinkFrame> {
      const deadline = Date.now() + timeoutMs;
      while (!queue.length) {
        const left = deadline - Date.now();
        if (left <= 0) throw new LinkError("timeout");
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, left);
          wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        wake = null;
      }
      return queue.shift()!;
    },
  };
}

/** The account key signs a device's Curve25519 identity key (same input as approve_device). */
export function deviceSigningInput(identityKey: string): Uint8Array {
  return utf8(identityKey);
}

export function accountPublicKey(seed: Uint8Array): string {
  return toB64(ed25519.getPublicKey(seed));
}

export type NewDeviceLink = {
  /** Text to render as a QR code. */
  qrText: string;
  qr: LinkQr;
  /** Subscribes to the relay, then resolves when history has been imported. */
  run(): Promise<{
    accountSigningKey: string;
    accountSeed: Uint8Array;
    imported: number;
  }>;
};

/** The new Device's side of QR linking (spec 4.3 and 7). */
export function startNewDeviceLink(args: {
  transport: LinkTransport;
  store: LocalStore;
  device: LinkedDeviceInfo;
  archive?: ArchiveStorage;
  onSafetyCode?: (code: string) => void;
  /**
   * The user compares the Safety Code with the other Device. The account key is not accepted
   * until this resolves true; false (or a missing callback) refuses the link.
   */
  confirmSafetyCode?: (code: string) => Promise<boolean>;
  onProgress?: (p: LinkProgress) => void;
  /** Receives the moved Account Signing Key seed before history starts; persist it here. */
  onAccountKey?: (seed: Uint8Array) => Promise<void> | void;
  timeoutMs?: number;
}): NewDeviceLink {
  const eph = createEphemeralKey();
  const qr: LinkQr = {
    v: 1,
    pub: eph.pub,
    deviceId: args.device.deviceId,
    nonce: newLinkNonce(),
  };
  const timeout = args.timeoutMs ?? 120_000;

  return {
    qr,
    qrText: encodeLinkQr(qr),
    async run() {
      const box = inbox(args.transport, timeout);
      try {
        // Only the first hello binds the session; later ones (also forged ones) are ignored.
        let hello: LinkFrame;
        do hello = await box.next();
        while (hello.t !== "hello");
        const channel = createLinkChannel({
          role: "new",
          nonce: qr.nonce,
          ownSecret: eph.secret,
          newPub: qr.pub,
          existingPub: hello.pub,
        });
        args.onSafetyCode?.(channel.safetyCode);
        const confirmed = (
          args.confirmSafetyCode?.(channel.safetyCode) ?? Promise.resolve(false)
        ).then(
          (ok) => ok,
          () => false,
        );
        await args.transport.send(
          channel.seal({ t: "device", info: args.device } satisfies ToExisting),
        );

        let seed: Uint8Array | null = null;
        let begin: Extract<ToNew, { t: "history_begin" }> | null = null;
        let nextChunk = 0;
        let received = 0;
        let receivedMessages = 0;
        let archiveDone = false;
        const pending: HistoryRecord[][] = [];
        const take = (records: unknown) => {
          const valid = validateHistoryRecords(records);
          received += valid.length;
          for (const r of valid) if (r.t === "message") receivedMessages++;
          if (
            !begin ||
            received > begin.records ||
            receivedMessages > begin.messages
          ) {
            throw new LinkError("history", "more records than announced");
          }
          pending.push(valid);
          args.onProgress?.({
            phase: "history",
            done: receivedMessages,
            total: begin.messages,
          });
        };
        for (;;) {
          let frame = await box.next();
          while (frame.t === "hello") frame = await box.next();
          const msg = parseToNew(channel.open(frame));
          switch (msg.t) {
            case "account_key": {
              if (seed) throw new LinkError("protocol", "second account_key");
              if (!(await confirmed))
                throw new LinkError("declined", "code not confirmed");
              seed = fromB64(msg.seed);
              await args.onAccountKey?.(seed);
              const signature = toB64(
                ed25519.sign(deviceSigningInput(args.device.identityKey), seed),
              );
              await args.transport.send(
                channel.seal({
                  t: "device_signature",
                  signature,
                } satisfies ToExisting),
              );
              break;
            }
            case "history_begin":
              if (!seed || begin) throw new LinkError("protocol");
              begin = msg;
              await args.store.init();
              break;
            case "history_chunk":
              if (!begin || begin.mode !== "chunks")
                throw new LinkError("protocol");
              if (msg.i !== nextChunk || msg.i >= begin.chunks) {
                throw new LinkError("history", "chunk out of order");
              }
              nextChunk++;
              take(msg.records);
              break;
            case "history_archive":
              if (!begin || begin.mode !== "archive" || archiveDone) {
                throw new LinkError("protocol");
              }
              if (!args.archive)
                throw new LinkError("history", "no archive storage");
              archiveDone = true;
              take(await downloadArchive(msg.ref, args.archive));
              break;
            case "history_end": {
              if (!seed || !begin) throw new LinkError("protocol");
              const complete =
                begin.mode === "chunks"
                  ? nextChunk === begin.chunks
                  : archiveDone || begin.records === 0;
              if (
                !complete ||
                received !== begin.records ||
                receivedMessages !== begin.messages
              ) {
                throw new LinkError("history", "history incomplete");
              }
              // Everything is validated and counted; only now touch the local store.
              let imported = 0;
              for (const records of pending) {
                imported += (await importHistoryChunk(args.store, records))
                  .messages;
              }
              return {
                accountSigningKey: accountPublicKey(seed),
                accountSeed: seed,
                imported,
              };
            }
            case "abort":
              throw new LinkError("declined", msg.reason);
          }
        }
      } finally {
        box.close();
      }
    },
  };
}

/** The existing Device's side: scan, show the code, wait for the user, move the key, send history. */
export async function runExistingDeviceLink(args: {
  transport: LinkTransport;
  qrText: string;
  store: LocalStore;
  /** Account Signing Key seed (32 bytes); moved to the new Device inside the encrypted relay. */
  accountSeed: Uint8Array;
  archive?: ArchiveStorage;
  confirm: (info: LinkedDeviceInfo, safetyCode: string) => Promise<boolean>;
  /** Called with the verified signature of the new Device (e.g. to call approve_device). */
  onSigned?: (
    info: LinkedDeviceInfo,
    signature: string,
  ) => Promise<void> | void;
  onProgress?: (p: LinkProgress) => void;
  timeoutMs?: number;
}): Promise<{ records: number; mode: "chunks" | "archive" }> {
  const qr = requireLinkQr(args.qrText);
  const eph = createEphemeralKey();
  const channel: LinkChannel = createLinkChannel({
    role: "existing",
    nonce: qr.nonce,
    ownSecret: eph.secret,
    newPub: qr.pub,
    existingPub: eph.pub,
  });
  const box = inbox(args.transport, args.timeoutMs ?? 120_000);
  const nextMsg = async () => {
    let f = await box.next();
    while (f.t === "hello") f = await box.next();
    return f;
  };
  try {
    await args.transport.send({ t: "hello", r: "existing", pub: eph.pub });
    const first = parseToExisting(channel.open(await nextMsg()));
    if (first.t !== "device") throw new LinkError("protocol");
    const info = first.info;
    if (info.deviceId !== qr.deviceId) throw new LinkError("wrong_device");
    if (!(await args.confirm(info, channel.safetyCode))) {
      await args.transport.send(
        channel.seal({ t: "abort", reason: "declined" } satisfies ToNew),
      );
      throw new LinkError("declined");
    }
    await args.transport.send(
      channel.seal({
        t: "account_key",
        seed: toB64(args.accountSeed),
      } satisfies ToNew),
    );
    const sig = parseToExisting(channel.open(await nextMsg()));
    if (sig.t !== "device_signature") throw new LinkError("protocol");
    const ok = ed25519.verify(
      fromB64(sig.signature),
      deviceSigningInput(info.identityKey),
      ed25519.getPublicKey(args.accountSeed),
    );
    if (!ok) throw new LinkError("auth", "device signature invalid");
    await args.onSigned?.(info, sig.signature);

    const plan = await planHistory(args.store);
    const mode =
      plan.bytes > ARCHIVE_THRESHOLD_BYTES && args.archive
        ? "archive"
        : "chunks";
    await args.transport.send(
      channel.seal({
        t: "history_begin",
        records: plan.records,
        messages: plan.messages,
        chunks: plan.chunks.length,
        mode,
      } satisfies ToNew),
    );
    if (mode === "archive") {
      const ref = await uploadArchive(plan.chunks, args.archive!);
      await args.transport.send(
        channel.seal({ t: "history_archive", ref } satisfies ToNew),
      );
    } else {
      let done = 0;
      for (let i = 0; i < plan.chunks.length; i++) {
        await args.transport.send(
          channel.seal({
            t: "history_chunk",
            i,
            records: plan.chunks[i],
          } satisfies ToNew),
        );
        done += plan.chunks[i].length;
        args.onProgress?.({ phase: "history", done, total: plan.records });
      }
    }
    await args.transport.send(
      channel.seal({ t: "history_end" } satisfies ToNew),
    );
    return { records: plan.records, mode };
  } finally {
    box.close();
  }
}
