/** Spec 6.2 schema, shared by every adapter. Bump when a statement changes. */
import { SEARCH_SCHEMA_STATEMENTS } from "./search-schema";

export const LOCAL_SCHEMA_VERSION = 2;

export const LOCAL_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT,
    avatar TEXT,
    last_message_id TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_user_id TEXT,
    sender_device_id TEXT,
    sent_at TEXT NOT NULL,
    received_at TEXT,
    kind TEXT NOT NULL,
    body TEXT,
    reply_to_id TEXT,
    edited_at TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    media_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_sent_idx ON messages (conversation_id, sent_at, id)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    delivered_at TEXT,
    read_at TEXT,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    message_id TEXT PRIMARY KEY,
    r2_key TEXT,
    key_b64 TEXT,
    sha256 TEXT,
    mime TEXT,
    size INTEGER,
    local_path TEXT,
    expired INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS crypto_state (
    name TEXT PRIMARY KEY,
    pickle BLOB
  )`,
  `CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  ...SEARCH_SCHEMA_STATEMENTS,
];

export const LOCAL_TABLES = [
  "conversations",
  "messages",
  "reactions",
  "receipts",
  "outbox",
  "media",
  "crypto_state",
  "messages_search",
  "kv",
] as const;
