import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";

import { BACKUP_KV_PREFIXES, isBackupKvKey } from "../backup";
import type {
  ConversationRow,
  LocalStore,
  MessageRow,
  ReactionRow,
  ReceiptRow,
} from "../local-store";
import { concat, fromB64, fromUtf8, toB64, utf8 } from "./bytes";
import { LinkError } from "./errors";

/** Above this many plaintext bytes the history goes to one encrypted archive instead of chunks. */
export const ARCHIVE_THRESHOLD_BYTES = 5 * 1024 * 1024;
/** Target plaintext size of one history_chunk (Broadcast messages are limited to ~256 KB). */
export const CHUNK_TARGET_BYTES = 96 * 1024;
const PAGE = 500;

export type HistoryRecord =
  | { t: "conversation"; row: ConversationRow }
  | { t: "message"; row: MessageRow }
  | { t: "reaction"; row: ReactionRow }
  | { t: "receipt"; row: ReceiptRow }
  | { t: "kv"; key: string; value: string };

/**
 * Walks the local database, newest chats first. Media travel as references only (media_json holds
 * the R2 location and file key, so media still expire with R2). Keys and sessions are never read.
 */
export async function* exportHistoryRecords(store: LocalStore): AsyncGenerator<HistoryRecord> {
  for (const row of await store.listConversations()) {
    yield { t: "conversation", row };
    let before: { sentAt: string; id: string } | null = null;
    for (;;) {
      const page = await store.listMessages(row.id, { limit: PAGE, before });
      if (page.length === 0) break;
      const ids = page.map((m) => m.id);
      for (const m of page) yield { t: "message", row: m };
      for (const r of await store.listReactions(ids)) yield { t: "reaction", row: r };
      for (const r of await store.listReceipts(ids)) yield { t: "receipt", row: r };
      if (page.length < PAGE) break;
      const last = page[page.length - 1];
      before = { sentAt: last.sent_at, id: last.id };
    }
  }
  for (const prefix of BACKUP_KV_PREFIXES) {
    for (const { key, value } of await store.listKv(prefix)) {
      if (isBackupKvKey(key)) yield { t: "kv", key, value };
    }
  }
}

export type HistoryPlan = {
  records: number;
  messages: number;
  bytes: number;
  chunks: HistoryRecord[][];
};

export async function planHistory(
  store: LocalStore,
  chunkBytes = CHUNK_TARGET_BYTES,
): Promise<HistoryPlan> {
  const chunks: HistoryRecord[][] = [];
  let cur: HistoryRecord[] = [];
  let curBytes = 0;
  let records = 0;
  let messages = 0;
  let bytes = 0;
  for await (const rec of exportHistoryRecords(store)) {
    const size = utf8(JSON.stringify(rec)).length + 1;
    if (cur.length && curBytes + size > chunkBytes) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(rec);
    curBytes += size;
    bytes += size;
    records++;
    if (rec.t === "message") messages++;
  }
  if (cur.length) chunks.push(cur);
  return { records, messages, bytes, chunks };
}

export type ImportCounts = {
  conversations: number;
  messages: number;
  reactions: number;
  receipts: number;
};

/** Applies one chunk. Messages go in before the reactions that point at them. */
export async function importHistoryChunk(
  store: LocalStore,
  records: readonly HistoryRecord[],
): Promise<ImportCounts> {
  const counts: ImportCounts = { conversations: 0, messages: 0, reactions: 0, receipts: 0 };
  const convs: ConversationRow[] = [];
  const msgs: MessageRow[] = [];
  const rest: HistoryRecord[] = [];
  for (const r of records) {
    if (r.t === "conversation") convs.push(r.row);
    else if (r.t === "message") msgs.push(r.row);
    else rest.push(r);
  }
  if (convs.length) await store.upsertConversations(convs);
  if (msgs.length) await store.upsertMessages(msgs);
  counts.conversations = convs.length;
  counts.messages = msgs.length;
  for (const r of rest) {
    if (r.t === "reaction") {
      await store.setReaction(r.row);
      counts.reactions++;
    } else if (r.t === "receipt") {
      await store.upsertReceipt(r.row);
      counts.receipts++;
    } else if (r.t === "kv" && isBackupKvKey(r.key)) {
      await store.setKv(r.key, r.value);
    }
  }
  return counts;
}

/** Where the encrypted archive lives (R2 in production). Only ciphertext is ever handed over. */
export interface ArchiveStorage {
  upload(ciphertext: Uint8Array): Promise<string>;
  download(location: string): Promise<Uint8Array>;
}

export type ArchiveRef = { location: string; key: string; size: number; sha256: string };

/** Encrypts all records into one archive (XChaCha20-Poly1305, random key) and uploads it. */
export async function uploadArchive(
  chunks: readonly HistoryRecord[][],
  storage: ArchiveStorage,
): Promise<ArchiveRef> {
  const lines: string[] = [];
  for (const c of chunks) for (const r of c) lines.push(JSON.stringify(r));
  const key = randomBytes(32);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8(lines.join("\n")));
  const blob = concat(nonce, ct);
  const location = await storage.upload(blob);
  return { location, key: toB64(key), size: blob.length, sha256: toB64(sha256(blob)) };
}

export async function downloadArchive(
  ref: ArchiveRef,
  storage: ArchiveStorage,
): Promise<HistoryRecord[]> {
  const blob = await storage.download(ref.location);
  if (blob.length !== ref.size || toB64(sha256(blob)) !== ref.sha256) {
    throw new LinkError("history", "archive does not match");
  }
  try {
    const plain = xchacha20poly1305(fromB64(ref.key), blob.subarray(0, 24)).decrypt(
      blob.subarray(24),
    );
    const text = fromUtf8(plain);
    return text ? text.split("\n").map((l) => JSON.parse(l) as HistoryRecord) : [];
  } catch {
    throw new LinkError("history", "archive cannot be opened");
  }
}
