import type { PGliteInterface } from "@electric-sql/pglite";

import { asAnon, asUser } from "./pglite";

type RpcError = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };

type ProcMeta = {
  proretset: boolean;
  argNames: string[];
};

const procCache = new WeakMap<PGliteInterface, Map<string, ProcMeta>>();

async function getProcMeta(db: PGliteInterface, fn: string): Promise<ProcMeta> {
  let cache = procCache.get(db);
  if (!cache) {
    cache = new Map();
    procCache.set(db, cache);
  }
  const cached = cache.get(fn);
  if (cached) {
    return cached;
  }

  const result = await db.query<{
    proretset: boolean;
    arg_names: string[] | null;
  }>(
    `select p.proretset,
            coalesce(
              (
                select array_agg(a.argname order by a.argnum)
                from unnest(p.proargnames) with ordinality as a(argname, argnum)
                where a.argname is not null and a.argname <> ''
              ),
              array[]::text[]
            ) as arg_names
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1
     limit 1`,
    [fn],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Unknown RPC function: ${fn}`);
  }

  const meta: ProcMeta = {
    proretset: row.proretset,
    argNames: row.arg_names ?? [],
  };
  cache.set(fn, meta);
  return meta;
}

function buildCall(fn: string, meta: ProcMeta, argKeys: string[]): string {
  if (argKeys.length === 0) {
    return `select * from public.${fn}()`;
  }

  const parts = argKeys.map((key, index) => {
    const name = meta.argNames[index] ?? `p_${key}`;
    return `${name} => $${index + 1}`;
  });

  if (meta.proretset) {
    return `select * from public.${fn}(${parts.join(", ")})`;
  }
  return `select public.${fn}(${parts.join(", ")}) as value`;
}

function serializeArg(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

async function runRpc(
  db: PGliteInterface,
  userId: string | null,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult> {
  const meta = await getProcMeta(db, fn);
  const argKeys = Object.keys(args);
  const sql = buildCall(fn, meta, argKeys);
  const params = argKeys.map((key) => serializeArg(args[key]));

  const run = userId
    ? (query: string, p: unknown[]) => asUser(db, userId, query, p)
    : (query: string, p: unknown[]) => asAnon(db, query, p);

  try {
    const result = await run(sql, params);
    const rows = (result as { rows: Record<string, unknown>[] }).rows;

    if (meta.proretset) {
      return { data: rows, error: null };
    }

    if (rows.length === 0) {
      return { data: null, error: null };
    }

    const row = rows[0]!;
    if ("value" in row) {
      return { data: row.value, error: null };
    }
    return { data: row, error: null };
  } catch (error) {
    const pgError = error as {
      message?: string;
      code?: string;
    };
    return {
      data: null,
      error: {
        message: pgError.message ?? String(error),
        code: pgError.code,
      },
    };
  }
}

export type PgliteRpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): Promise<RpcResult>;
};

export function createRpcClient(
  db: PGliteInterface,
  userId: string | null,
): PgliteRpcClient {
  return {
    rpc(fn, args) {
      return runRpc(db, userId, fn, args ?? {});
    },
  };
}
