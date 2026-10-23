import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore } from "./local-store";
import { createNodeSqliteExecutor } from "./node-sqlite-executor";
import { toFtsQuery } from "./search";
import type { MessageRow } from "./types";

function msg(id: string, body: string | null, extra: Partial<MessageRow> = {}): MessageRow {
  return {
    id,
    conversation_id: "c1",
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: `2026-01-01T00:00:${id.replace(/\D/g, "").padStart(2, "0")}Z`,
    received_at: null,
    kind: "text",
    body,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
    ...extra,
  };
}

describe("local message search (FTS5)", () => {
  let exec: ReturnType<typeof createNodeSqliteExecutor>;
  let store: LocalStore;
  const ids = async (query: string, extra: { conversationId?: string; limit?: number; offset?: number } = {}) =>
    (await store.searchMessages({ query, ...extra })).map((h) => h.message.id);

  beforeEach(async () => {
    exec = createNodeSqliteExecutor();
    store = createSqlLocalStore(exec);
    await store.init();
  });
  afterEach(() => exec.close());

  it("indexes a message on insert, and picks up new ones", async () => {
    expect(await ids("pineapple")).toEqual([]);
    await store.upsertMessages([msg("m1", "I like pineapple pizza")]);
    expect(await ids("pineapple")).toEqual(["m1"]);
    await store.upsertMessages([msg("m2", "pineapple again")]);
    expect((await ids("pineapple")).sort()).toEqual(["m1", "m2"]);
  });

  it("re-indexes after an edit", async () => {
    await store.upsertMessages([msg("m1", "banana split")]);
    await store.upsertMessages([msg("m1", "cherry pie", { edited_at: "2026-01-02T00:00:00Z" })]);
    expect(await ids("banana")).toEqual([]);
    expect(await ids("cherry")).toEqual(["m1"]);
  });

  it("removes soft-deleted messages and ignores null bodies", async () => {
    await store.upsertMessages([msg("m1", "secret plan"), msg("m2", null)]);
    expect(await ids("secret")).toEqual(["m1"]);
    await store.upsertMessages([msg("m1", "secret plan", { deleted: 1 })]);
    expect(await ids("secret")).toEqual([]);
    await store.upsertMessages([msg("m1", "secret plan", { deleted: 0 })]);
    expect(await ids("secret")).toEqual(["m1"]);
  });

  it("removes rows from the index when deleted for real and on wipe", async () => {
    await store.upsertMessages([msg("m1", "gone soon")]);
    await exec.exec(`DELETE FROM messages WHERE id = ?`, ["m1"]);
    expect(await ids("gone")).toEqual([]);
    await store.upsertMessages([msg("m2", "gone later")]);
    await store.wipe();
    expect(await ids("gone")).toEqual([]);
  });

  it("matches prefixes and is case-insensitive", async () => {
    await store.upsertMessages([msg("m1", "Wonderful weather")]);
    expect(await ids("wond")).toEqual(["m1"]);
    expect(await ids("WEATHER")).toEqual(["m1"]);
    expect(await ids("wonderful weath")).toEqual(["m1"]);
    expect(await ids("wonderful rain")).toEqual([]);
  });

  it("ignores French diacritics in both directions", async () => {
    await store.upsertMessages([msg("m1", "On se retrouve au café après le déjeuner"), msg("m2", "resume plain")]);
    expect(await ids("cafe")).toEqual(["m1"]);
    expect(await ids("apres")).toEqual(["m1"]);
    expect(await ids("déjeuner")).toEqual(["m1"]);
    expect(await ids("résumé")).toEqual(["m2"]);
  });

  it("matches Arabic with and without harakat, and folds alef forms", async () => {
    await store.upsertMessages([
      msg("m1", "مَرْحَبًا بالعالم"),
      msg("m2", "أحمد وصل"),
    ]);
    expect(await ids("مرحبا")).toEqual(["m1"]);
    expect(await ids("مَرْحَبًا")).toEqual(["m1"]);
    expect(await ids("بالعال")).toEqual(["m1"]);
    expect(await ids("احمد")).toEqual(["m2"]);
  });

  it("ranks the better match first", async () => {
    await store.upsertMessages([
      msg("m1", "meeting notes from a very long afternoon of other unrelated discussion topics and more"),
      msg("m2", "meeting meeting meeting"),
    ]);
    expect((await store.searchMessages({ query: "meeting" }))[0]?.message.id).toBe("m2");
  });

  it("returns a snippet with the match marked", async () => {
    await store.upsertMessages([msg("m1", "let us meet at the harbour tomorrow")]);
    const [hit] = await store.searchMessages({ query: "harb" });
    expect(hit?.snippet.filter((p) => p.match).map((p) => p.text)).toEqual(["harbour"]);
    expect(hit?.snippet.map((p) => p.text).join("")).toContain("let us meet");
  });

  it("scopes to one chat or searches all, with limit and offset", async () => {
    await store.upsertMessages([
      msg("m1", "apple one", { conversation_id: "c1" }),
      msg("m2", "apple two", { conversation_id: "c2" }),
      msg("m3", "apple three", { conversation_id: "c1" }),
    ]);
    expect((await ids("apple")).sort()).toEqual(["m1", "m2", "m3"]);
    expect((await ids("apple", { conversationId: "c1" })).sort()).toEqual(["m1", "m3"]);
    const page1 = await ids("apple", { limit: 2 });
    const page2 = await ids("apple", { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    expect(new Set([...page1, ...page2]).size).toBe(3);
  });

  it("treats FTS syntax in the query as plain text", async () => {
    await store.upsertMessages([msg("m1", "hello world")]);
    expect(await ids('"hello" (world*')).toEqual(["m1"]);
    expect(await ids("   ")).toEqual([]);
    expect(await ids('"')).toEqual([]);
    expect(toFtsQuery("a-b")).toBe('"a"* "b"*');
  });

  it("backfills the index for a database that already has messages", async () => {
    for (const t of ["ai", "ad", "au"]) await exec.exec(`DROP TRIGGER messages_search_${t}`);
    await exec.exec(`DROP TABLE messages_search`);
    await exec.exec(
      `INSERT INTO messages (id, conversation_id, sent_at, kind, body, deleted) VALUES ('old', 'c1', 't', 'text', 'ancient words', 0)`,
    );
    await store.init();
    expect(await ids("ancient")).toEqual(["old"]);
  });
});
