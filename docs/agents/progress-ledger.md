# Pulse build — progress ledger

Branch: `agent/pulse-build` (local only; nothing pushed, no issues closed).

## Environment constraints

- No Docker on this machine, so the Supabase CLI local stack cannot start.
- Remote Supabase project `pjaljbmuapcrrbfnujvx` is empty; no service-role key is available to the agent.
- SQL (schema, RLS, functions) is verified with PGlite (embedded PostgreSQL) plus a stub of the Supabase `auth`/`storage` schemas.
- Supabase-backed integration and browser tests run only when real env vars are present; otherwise they skip with a reason.

## Coordinator decisions (deviations from the specs are listed here)

- Data access: every app read/write goes through PostgreSQL functions called with `supabase.rpc`. Tables keep the spec's SELECT policies (they also guard Realtime); `insert/update/delete` are revoked from `anon`/`authenticated`, and writes run in `security definer` functions that check `auth.uid()`. Errors are raised as the stable code string (`feature.code`).
- Because of that, feature tickets add their own functions in **new** migration files. The specs only allow later migrations for indexes; this is the one deliberate deviation, and no ticket edits another ticket's migration.
- Service tests run on PGlite through `tests/db/rpc-client.ts`, which behaves like `supabase.rpc` for a given user, so row-level security is exercised.
- Feature discovery: `scripts/gen-features.mjs` generates a git-ignored registry from `src/features/*/contributions.tsx` and catalogs; npm pre-hooks run it.

## Waves

| Wave | Issues |
| --- | --- |
| 0 | #1 |
| 1 | #2, #3, #5, #6 |
| 2 | #4 |
| 3 | #7, #8, #9, #10 (identity); #11, #12, #13 (safety); #14, #15 (locale); #16, #17 (notifications); #18, #19, #20 (discovery); #21, #22, #23, #24 (direct messaging); #25, #26 (typing/presence) |
| 4 | #27, #28, #29 (message actions); #30 (reactions); #31–#34 (media); #35–#38 (groups); #39, #40 (search); #41, #42 (organization); #43, #44 (requests) |
| 5 | #45–#48 (browser journeys) |

## Status

| Issue | Status | Commit | Tests | Notes |
| --- | --- | --- | --- | --- |
| #1 | done | 67c1877 | lint, typecheck, 14 unit tests, build, fail-fast start verified | Coordinator fixed ESLint ignoring `.next/` |
| #2 | done | 48c28b2 | 14 PGlite DB tests (RLS enforced), 6 rpc mapping tests; live Supabase tests skip without env | Coordinator hardening: revoked TRUNCATE/REFERENCES/TRIGGER, default privileges so later tables/functions start locked, `decide_interaction` refuses third-party probes, `is_blocked_either` not callable by clients. Known low-risk gap: `is_member` lets a member check membership of a guessed conversation id. |
| #4 | in progress | | | |
| #3 | done | 747577d | lint, typecheck, unit tests, build; Playwright smoke 4 passed, 1 skipped (authenticated shell needs a live Supabase) | Coordinator fixes: landing now follows the visitor's locale (it always showed Arabic copy) with localized legal links; locale and theme share one cached profile lookup per request |
| #5 | done | 3661afb | workflow YAML parsed; not run on GitHub (nothing pushed) | Coordinator fixed the migrations job to use the installed CLI binary |
| #6 | done | c212df2 | 29 unit tests, ESLint clean | Coordinator closed a leak: `Error` objects nested in event properties now drop their message |
