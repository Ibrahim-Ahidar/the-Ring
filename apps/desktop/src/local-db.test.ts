import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLocalDbService,
  parseLocalDbRequest,
  type DbDriver,
  type LocalDbService,
} from "./local-db";

const KEY = Buffer.alloc(32, 7).toString("base64");

/** node:sqlite behind the driver slice; cipher and key pragmas are no-ops here. */
function nodeDriver(file: string, log: string[]): DbDriver {
  const db = new DatabaseSync(file);
  return {
    prepare: (sql) => {
      const s = db.prepare(sql);
      return { run: (...p) => s.run(...(p as never[])), all: (...p) => s.all(...(p as never[])) };
    },
    pragma(source) {
      log.push(source);
      if (/^(cipher|key)\b/.test(source)) return;
      db.exec(`PRAGMA ${source}`);
    },
    close: () => db.close(),
  };
}

describe("desktop local database service", () => {
  let dir: string;
  let file: string;
  let pragmas: string[];
  let keyDeleted: number;
  let key: string | null;
  let service: LocalDbService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-localdb-"));
    file = path.join(dir, "pulse-local.db");
    pragmas = [];
    keyDeleted = 0;
    key = KEY;
    service = createLocalDbService({
      file,
      getKey: () => key,
      deleteKey: () => void keyDeleted++,
      open: (f) => nodeDriver(f, pragmas),
      removeFile: (p) => fs.rmSync(p, { force: true }),
    });
  });
  afterEach(() => {
    service.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is a SQLite file on disk, keyed before any statement runs", () => {
    expect(service.handle({ op: "exec", sql: "CREATE TABLE t (a, b)", params: [] })).toEqual({ ok: true });
    expect(fs.existsSync(file)).toBe(true);
    expect(pragmas[0]).toBe("cipher = 'sqlcipher'");
    expect(pragmas[1]).toBe(`key = "x'${Buffer.alloc(32, 7).toString("hex")}'"`);
  });

  it("runs exec and query with params", () => {
    service.handle({ op: "exec", sql: "CREATE TABLE t (a, b)", params: [] });
    service.handle({ op: "exec", sql: "INSERT INTO t VALUES (?, ?)", params: ["x", 2] });
    expect(service.handle({ op: "query", sql: "SELECT a, b FROM t WHERE a = ?", params: ["x"] })).toEqual({
      ok: true,
      rows: [{ a: "x", b: 2 }],
    });
  });

  it("supports BEGIN / ROLLBACK sequenced by the page", () => {
    service.handle({ op: "exec", sql: "CREATE TABLE t (a)", params: [] });
    service.handle({ op: "exec", sql: "BEGIN", params: [] });
    service.handle({ op: "exec", sql: "INSERT INTO t VALUES (1)", params: [] });
    service.handle({ op: "exec", sql: "ROLLBACK", params: [] });
    expect(service.handle({ op: "query", sql: "SELECT count(*) AS n FROM t", params: [] })).toEqual({
      ok: true,
      rows: [{ n: 0 }],
    });
  });

  it("returns SQL errors instead of throwing", () => {
    const res = service.handle({ op: "exec", sql: "NOT SQL", params: [] });
    expect(res.ok).toBe(false);
  });

  it("refuses to open when safeStorage cannot hold the key", () => {
    key = null;
    const res = service.handle({ op: "query", sql: "SELECT 1", params: [] });
    expect(res).toEqual({ ok: false, error: "local storage key unavailable" });
    expect(fs.existsSync(file)).toBe(false);
  });

  it("destroy removes the file and the key", () => {
    service.handle({ op: "exec", sql: "CREATE TABLE t (a)", params: [] });
    expect(fs.existsSync(file)).toBe(true);
    expect(service.handle({ op: "destroy" })).toEqual({ ok: true });
    expect(fs.existsSync(file)).toBe(false);
    expect(keyDeleted).toBe(1);
    // A later request starts a fresh empty database.
    service.handle({ op: "exec", sql: "CREATE TABLE t (a)", params: [] });
    expect(fs.existsSync(file)).toBe(true);
  });

  it("opens nothing until the first request", () => {
    expect(pragmas).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe("local database request validation", () => {
  const bad: unknown[] = [
    null,
    "exec",
    42,
    {},
    { op: "drop" },
    { op: "exec" },
    { op: "exec", sql: "" },
    { op: "exec", sql: 5 },
    { op: "exec", sql: "x".repeat(100_001) },
    { op: "exec", sql: "SELECT 1", params: "nope" },
    { op: "exec", sql: "SELECT 1", params: [{}] },
    { op: "exec", sql: "SELECT 1", params: [undefined] },
    { op: "query", sql: "SELECT 1", params: [Number.NaN] },
    { op: "query", sql: "SELECT 1", params: new Array(1000).fill(1) },
  ];
  it.each(bad.map((b, i) => [i, b]))("rejects bad request #%i", (_i, raw) => {
    expect(parseLocalDbRequest(raw)).toBeNull();
  });

  it("rejects bad requests through the service without opening the database", () => {
    const opened: string[] = [];
    const svc = createLocalDbService({
      file: "x.db",
      getKey: () => KEY,
      deleteKey: () => {},
      open: (f) => {
        opened.push(f);
        throw new Error("should not open");
      },
      removeFile: () => {},
    });
    expect(svc.handle({ op: "exec", sql: 5 })).toEqual({
      ok: false,
      error: "invalid local database request",
    });
    expect(opened).toEqual([]);
  });

  it("accepts valid requests", () => {
    expect(parseLocalDbRequest({ op: "query", sql: "SELECT ?", params: [null, 1, "a", new Uint8Array(2)] })).not.toBeNull();
    expect(parseLocalDbRequest({ op: "exec", sql: "BEGIN" })).toEqual({ op: "exec", sql: "BEGIN", params: [] });
    expect(parseLocalDbRequest({ op: "destroy", extra: 1 })).toEqual({ op: "destroy" });
  });
});
