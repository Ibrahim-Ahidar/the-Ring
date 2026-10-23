/**
 * FTS5 index for local message search (spec D16, #218).
 *
 * `messages_search` stores a normalized copy of messages.body, kept in sync by triggers.
 * Normalization removes Arabic harakat/tatweel and folds alef forms, because the FTS5
 * unicode61 tokenizer only strips Latin diacritics. The tokenizer itself lower-cases and
 * removes Latin diacritics (remove_diacritics 2), so "cafe" matches "Café".
 * Soft-deleted messages (deleted = 1) and null bodies are not indexed.
 */

/** Characters removed from indexed and queried text: Arabic harakat, superscript alef, tatweel. */
const STRIPPED: readonly number[] = [
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0670, 0x0640,
];
/** Alef with hamza/madda/wasl folded to a plain alef. */
const ALEF_FOLD: readonly number[] = [0x0622, 0x0623, 0x0625, 0x0671];

/** JS twin of the SQL normalization below. Must stay in step with it. */
export function normalizeSearchText(text: string): string {
  let out = text.normalize("NFC");
  for (const c of STRIPPED) out = out.split(String.fromCodePoint(c)).join("");
  for (const c of ALEF_FOLD) out = out.split(String.fromCodePoint(c)).join("\u0627");
  return out;
}

function sqlNormalize(column: string): string {
  let expr = column;
  for (const c of STRIPPED) expr = `replace(${expr}, char(${c}), '')`;
  for (const c of ALEF_FOLD) expr = `replace(${expr}, char(${c}), char(1575))`;
  return expr;
}

export const SEARCH_SCHEMA_STATEMENTS: readonly string[] = [
  // Replaces the unused external-content table and triggers from the first schema.
  `DROP TRIGGER IF EXISTS messages_fts_ai`,
  `DROP TRIGGER IF EXISTS messages_fts_ad`,
  `DROP TRIGGER IF EXISTS messages_fts_au`,
  `DROP TABLE IF EXISTS messages_fts`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_search USING fts5(
    body, tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS messages_search_ai AFTER INSERT ON messages
   WHEN new.deleted = 0 AND new.body IS NOT NULL BEGIN
    INSERT INTO messages_search(rowid, body) VALUES (new.rowid, ${sqlNormalize("new.body")});
  END`,
  `CREATE TRIGGER IF NOT EXISTS messages_search_ad AFTER DELETE ON messages BEGIN
    DELETE FROM messages_search WHERE rowid = old.rowid;
  END`,
  `CREATE TRIGGER IF NOT EXISTS messages_search_au AFTER UPDATE ON messages BEGIN
    DELETE FROM messages_search WHERE rowid = old.rowid;
    INSERT INTO messages_search(rowid, body)
      SELECT new.rowid, ${sqlNormalize("new.body")} WHERE new.deleted = 0 AND new.body IS NOT NULL;
  END`,
  // Fills the index for databases created before it existed. No-op once it has rows.
  `INSERT INTO messages_search(rowid, body)
    SELECT rowid, ${sqlNormalize("body")} FROM messages
    WHERE deleted = 0 AND body IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM messages_search LIMIT 1)`,
];
