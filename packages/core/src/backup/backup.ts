import type {
  ConversationRow,
  LocalStore,
  MessageRow,
  ReactionRow,
  ReceiptRow,
} from "../local-store";
import { BackupError } from "./errors";
import {
  decryptBackup,
  encryptBackup,
  type BackupSecret,
  type EncryptOptions,
} from "./format";

export const BACKUP_PAYLOAD_VERSION = 1;
const PAGE = 500;

/**
 * kv keys that are safe to back up (chat state only). Everything else is left out, which keeps
 * Olm/Megolm sessions (`olm.sessions.*`), device identity, outbox payloads and cursors out of the
 * file. The crypto_state table is never read.
 */
export const BACKUP_KV_PREFIXES = ["read:", "pin:", "audio_play:", "ctlts:"] as const;
const KV_DENY = /olm|megolm|session|pickle|identity|secret|private|account|device/i;

export function isBackupKvKey(key: string): boolean {
  return BACKUP_KV_PREFIXES.some((p) => key.startsWith(p)) && !KV_DENY.test(key);
}

export type BackupExportOptions = EncryptOptions & {
  /** Keep media metadata (and the file keys inside it) so media can be re-downloaded. Off by default. */
  includeMedia?: boolean;
  now?: () => Date;
};

type BackupRecord =
  | { t: "meta"; v: number; createdAt: string; includeMedia: boolean }
  | { t: "conversation"; row: ConversationRow }
  | { t: "message"; row: MessageRow }
  | { t: "reaction"; row: ReactionRow }
  | { t: "receipt"; row: ReceiptRow }
  | { t: "kv"; key: string; value: string };

/** The plaintext records of a backup, one JSON object per line. Exposed for tests and auditing. */
export async function buildBackupPayload(
  store: LocalStore,
  opts: Pick<BackupExportOptions, "includeMedia" | "now"> = {},
): Promise<Uint8Array> {
  const includeMedia = opts.includeMedia === true;
  const lines: string[] = [];
  const push = (r: BackupRecord) => lines.push(JSON.stringify(r));
  push({
    t: "meta",
    v: BACKUP_PAYLOAD_VERSION,
    createdAt: (opts.now?.() ?? new Date()).toISOString(),
    includeMedia,
  });

  for (const row of await store.listConversations()) {
    push({ t: "conversation", row });
    let before: { sentAt: string; id: string } | null = null;
    for (;;) {
      const page = await store.listMessages(row.id, { limit: PAGE, before });
      if (page.length === 0) break;
      const ids = page.map((m) => m.id);
      for (const m of page) push({ t: "message", row: includeMedia ? m : { ...m, media_json: null } });
      for (const r of await store.listReactions(ids)) push({ t: "reaction", row: r });
      for (const r of await store.listReceipts(ids)) push({ t: "receipt", row: r });
      if (page.length < PAGE) break;
      const last = page[page.length - 1];
      before = { sentAt: last.sent_at, id: last.id };
    }
  }
  for (const prefix of BACKUP_KV_PREFIXES) {
    for (const { key, value } of await store.listKv(prefix)) {
      if (isBackupKvKey(key)) push({ t: "kv", key, value });
    }
  }
  return new TextEncoder().encode(lines.join("\n") + "\n");
}

/** Exports chat history and state into an encrypted backup file. */
export async function exportBackup(
  store: LocalStore,
  secret: BackupSecret,
  opts: BackupExportOptions = {},
): Promise<Uint8Array> {
  return encryptBackup(await buildBackupPayload(store, opts), secret, opts);
}

export type RestoreSummary = {
  conversations: number;
  messages: number;
  reactions: number;
  receipts: number;
  kv: number;
  includeMedia: boolean;
};

/**
 * Decrypts and verifies the whole file first, then imports it into `store`. A bad passphrase,
 * tampered or truncated file throws BackupError before anything is written. Keys and sessions are
 * never restored; the Device keeps its own.
 */
export async function restoreBackup(
  store: LocalStore,
  file: Uint8Array,
  secret: BackupSecret,
): Promise<RestoreSummary> {
  const plain = await decryptBackup(file, secret);
  const records = parsePayload(plain);

  const summary: RestoreSummary = {
    conversations: 0,
    messages: 0,
    reactions: 0,
    receipts: 0,
    kv: 0,
    includeMedia: false,
  };
  const messages: MessageRow[] = [];
  const flush = async () => {
    if (messages.length) await store.upsertMessages(messages.splice(0));
  };

  await store.init();
  for (const r of records) {
    switch (r.t) {
      case "meta":
        summary.includeMedia = r.includeMedia;
        break;
      case "conversation":
        await store.upsertConversations([r.row]);
        summary.conversations++;
        break;
      case "message":
        messages.push(r.row);
        summary.messages++;
        if (messages.length >= PAGE) await flush();
        break;
      case "reaction":
        await flush();
        await store.setReaction(r.row);
        summary.reactions++;
        break;
      case "receipt":
        await store.upsertReceipt(r.row);
        summary.receipts++;
        break;
      case "kv":
        if (isBackupKvKey(r.key)) {
          await store.setKv(r.key, r.value);
          summary.kv++;
        }
        break;
    }
  }
  await flush();
  return summary;
}

function parsePayload(plain: Uint8Array): BackupRecord[] {
  const out: BackupRecord[] = [];
  let sawMeta = false;
  try {
    for (const line of new TextDecoder("utf-8", { fatal: true }).decode(plain).split("\n")) {
      if (!line) continue;
      const rec = JSON.parse(line) as BackupRecord;
      if (rec.t === "meta") {
        if (rec.v !== BACKUP_PAYLOAD_VERSION) throw new BackupError("unsupported", "Payload version");
        sawMeta = true;
      }
      out.push(rec);
    }
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError("corrupt", "Backup payload is not valid");
  }
  if (!sawMeta) throw new BackupError("corrupt", "Backup payload has no header");
  return out;
}
