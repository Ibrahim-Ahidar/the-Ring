import { ed25519 } from "@noble/curves/ed25519";

import type { LocalStore } from "../local-store";
import { fromB64, toB64, utf8 } from "./bytes";
import {
  createEphemeralKey,
  createLinkChannel,
  type LinkChannel,
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
  | { t: "history_begin"; records: number; messages: number; chunks: number; mode: "chunks" | "archive" }
  | { t: "history_chunk"; i: number; records: HistoryRecord[] }
  | { t: "history_archive"; ref: ArchiveRef }
  | { t: "history_end" }
  | { t: "abort"; reason: string };

type ToExisting =
  | { t: "device"; info: LinkedDeviceInfo }
  | { t: "device_signature"; signature: string };

/** Pull-style inbox over a transport so the flows read top to bottom. */
function inbox(transport: LinkTransport, timeoutMs: number) {
  const queue: LinkFrame[] = [];
  let wake: (() => void) | null = null;
  const unsub = transport.subscribe((f) => {
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
  run(): Promise<{ accountSigningKey: string; accountSeed: Uint8Array; imported: number }>;
};

/** The new Device's side of QR linking (spec 4.3 and 7). */
export function startNewDeviceLink(args: {
  transport: LinkTransport;
  store: LocalStore;
  device: LinkedDeviceInfo;
  archive?: ArchiveStorage;
  onSafetyCode?: (code: string) => void;
  onProgress?: (p: LinkProgress) => void;
  /** Receives the moved Account Signing Key seed before history starts; persist it here. */
  onAccountKey?: (seed: Uint8Array) => Promise<void> | void;
  timeoutMs?: number;
}): NewDeviceLink {
  const eph = createEphemeralKey();
  const qr: LinkQr = { v: 1, pub: eph.pub, deviceId: args.device.deviceId, nonce: newLinkNonce() };
  const timeout = args.timeoutMs ?? 120_000;

  return {
    qr,
    qrText: encodeLinkQr(qr),
    async run() {
      const box = inbox(args.transport, timeout);
      try {
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
        await args.transport.send(
          channel.seal({ t: "device", info: args.device } satisfies ToExisting),
        );

        let seed: Uint8Array | null = null;
        let imported = 0;
        let total = 0;
        let mode: "chunks" | "archive" = "chunks";
        const apply = async (records: HistoryRecord[]) => {
          const c = await importHistoryChunk(args.store, records);
          imported += c.messages;
          args.onProgress?.({ phase: "history", done: Math.min(imported, total), total });
        };
        for (;;) {
          const msg = channel.open(await box.next()) as ToNew;
          switch (msg.t) {
            case "account_key": {
              seed = fromB64(msg.seed);
              await args.onAccountKey?.(seed);
              const signature = toB64(
                ed25519.sign(deviceSigningInput(args.device.identityKey), seed),
              );
              await args.transport.send(
                channel.seal({ t: "device_signature", signature } satisfies ToExisting),
              );
              break;
            }
            case "history_begin":
              total = msg.messages;
              mode = msg.mode;
              await args.store.init();
              break;
            case "history_chunk":
              if (mode !== "chunks") throw new LinkError("protocol");
              await apply(msg.records);
              break;
            case "history_archive":
              if (!args.archive) throw new LinkError("history", "no archive storage");
              await apply(await downloadArchive(msg.ref, args.archive));
              break;
            case "history_end":
              if (!seed) throw new LinkError("protocol");
              return { accountSigningKey: accountPublicKey(seed), accountSeed: seed, imported };
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
  onSigned?: (info: LinkedDeviceInfo, signature: string) => Promise<void> | void;
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
  try {
    await args.transport.send({ t: "hello", r: "existing", pub: eph.pub });
    const first = channel.open(await box.next()) as ToExisting;
    if (first.t !== "device") throw new LinkError("protocol");
    const info = first.info;
    if (info.deviceId !== qr.deviceId) throw new LinkError("wrong_device");
    if (!(await args.confirm(info, channel.safetyCode))) {
      await args.transport.send(channel.seal({ t: "abort", reason: "declined" } satisfies ToNew));
      throw new LinkError("declined");
    }
    await args.transport.send(
      channel.seal({ t: "account_key", seed: toB64(args.accountSeed) } satisfies ToNew),
    );
    const sig = channel.open(await box.next()) as ToExisting;
    if (sig.t !== "device_signature") throw new LinkError("protocol");
    const ok = ed25519.verify(
      fromB64(sig.signature),
      deviceSigningInput(info.identityKey),
      ed25519.getPublicKey(args.accountSeed),
    );
    if (!ok) throw new LinkError("auth", "device signature invalid");
    await args.onSigned?.(info, sig.signature);

    const plan = await planHistory(args.store);
    const mode = plan.bytes > ARCHIVE_THRESHOLD_BYTES && args.archive ? "archive" : "chunks";
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
      await args.transport.send(channel.seal({ t: "history_archive", ref } satisfies ToNew));
    } else {
      let done = 0;
      for (let i = 0; i < plan.chunks.length; i++) {
        await args.transport.send(
          channel.seal({ t: "history_chunk", i, records: plan.chunks[i] } satisfies ToNew),
        );
        done += plan.chunks[i].length;
        args.onProgress?.({ phase: "history", done, total: plan.records });
      }
    }
    await args.transport.send(channel.seal({ t: "history_end" } satisfies ToNew));
    return { records: plan.records, mode };
  } finally {
    box.close();
  }
}
