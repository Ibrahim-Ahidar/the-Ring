/** Spec 6.2 schema, shared by every adapter. Bump when a statement changes. */
export const LOCAL_SCHEMA_VERSION = 1;

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
  // FTS5 external-content table over messages.body; search queries arrive with #218.
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    body, content='messages', content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, body) VALUES (new.rowid, new.body);
  END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
  END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
    INSERT INTO messages_fts(rowid, body) VALUES (new.rowid, new.body);
  END`,
];

export const LOCAL_TABLES = [
  "conversations",
  "messages",
  "reactions",
  "receipts",
  "outbox",
  "media",
  "crypto_state",
  "messages_fts",
  "kv",
] as const;
