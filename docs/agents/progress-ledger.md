# Pulse build — progress ledger

Branch: `agent/pulse-build` (local only; nothing pushed, no issues closed).

## Handoff (2026-10-09 01:35) — resume here

- Committed through the realtime follow-up after `80786bb` (DM host integration + CSS module fix). `80786bb` itself was not built before later commits; rebuild `../chatapp-verify` at `HEAD`. Live message updates (edit, delete, upload ready, delete-for-me) are in direct messaging. `message_hides` is in the realtime publication and selectable only by the hiding user.
- Uncommitted, in progress: groups (`src/features/groups`, `src/app/app/groups/**`, `20261010040000_groups.sql`, `tests/db/groups.test.ts`; tsc errors in `groups/service.ts` `Result<null>` vs `Result<void>`), message requests (`src/features/message-requests`, `src/app/app/chats/requests`, `20261010070000_message_requests.sql`), media (`src/features/media`, `src/app/app/media/**`, `20261010030000_media.sql`, `tests/db/media.test.ts`).
- Agents still running when handed off: media review fixes (blocks on upload, server-verified object size/existence on complete, `list_shared` volatile + storage purge, `fail_upload` state guard, RLS hiding pending uploads from non-senders, quota lock, explicit grants); DM Realtime UPDATE handling (edits, tombstones, upload ready, hides); groups and message-requests DB test fixes (3 failures reported earlier; later full run passed, unconfirmed).
- Next: verify each finished feature (tsc, eslint, `npx vitest run`, build in the worktree, Playwright smoke), independent SQL review for groups and message requests, commit per feature, then wave 5 (#45–#48 browser journeys need a live Supabase: document as blocked unless env is provided). Open product question for the user: should blocks also stop posting in shared groups?
- Rules: Shell needs `required_permissions: ["all"]`; agents follow `docs/agents/agent-brief.md`; never push, merge, or close issues without the user's say-so.

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
| #4 | done | 74e6fa3 | 91 passed / 2 skipped across the suite; TS and SQL username rules checked for parity | `mentions_only` filtering deferred to #17 per spec |
| shared | done | 0554016 | 3 realtime-hub tests | Coordinator added `realtime-hub.ts` (one ref-counted channel per topic), `composer-events.ts`, `session.ts`, nav badges, `docs/agents/agent-brief.md` |
| #7–#10 identity | done | c410a12 | 13 PGlite + jsdom tests; Playwright: /login and /signup render | Coordinator fixes: signup limiter made server-only (anon could burn another email's allowance); `/app` layout now enforces confirmed email + active device; email-link sign-in registers a device; error catalog keys were dotted and never resolved in next-intl (fixed in identity, DM, discovery + `tests/scripts/catalogs.test.ts` guard). Known limit: revoking a device blocks `/app` via the device cookie, but Supabase refresh tokens on that device stay valid until expiry. |
| #21–#24 direct messaging | done | db14d69, 13a5d89 | 13 PGlite tests | Coordinator: `messaging_unread_count` revoked from clients; `list_messages` now returns attachments and reactions for wave 4. Independent SQL review running. |
| #25–#26 typing/presence | done | 0f34987 | 15 tests | Mounted via `headerStatus` only |
| #14–#15 locale/appearance | done | b6b33af | 12 tests | Coordinator added `command` slot kind; quick language bar is a floating overlay because the shell header has no slot. Browser assertions for theme/palette deferred to #48. |
| build | green | | `npm run build` OK; Playwright smoke 6 passed, 1 skipped | after wave 3 |
| #27–#29 message actions | done (UI integration pending) | 5b9bded | 8 PGlite + 7 unit | Coordinator: `forward_message` skipped the block check, so a blocked user could forward into the blocked direct chat; fixed + test. Menu translation, disabled reasons, focus trap and link renderer selection live in DM hosts; handed to the DM integration agent. |
| #30 reactions | done | 8d8675f | 8 PGlite + 3 unit | Coordinator: reacting in a blocked direct chat was allowed (and notified the blocker); fixed + test. |
| build | green at 5b9bded | | tsc, eslint 0 errors, build OK, vitest 231 passed / 2 skipped | |
| #31–#34 media | in progress | | | Composer 2.5 |
| #35–#38 groups | in progress | | | Composer 2.5 |
| #39–#40 search | done | adfb665 | 9 PGlite + 2 unit; independent SQL review clean (no leaks) | Coordinator: search RPCs were marked `stable` but write rate-limit counters, now volatile. Not changed: reviewer suggested rate-limiting before the membership check; that cannot work because the raised error rolls back the counter in the same transaction. A valid-username global search consumes two `search_users` units (search + discovery). Jump-to-message moving into DM (integration agent). |
| #41–#42 organization | done (list wiring pending) | a6256d8 | 7 PGlite + 3 unit; independent SQL review clean | Folder strip mount point, `?archived=1` / `?folder=` list filters and translated list-menu labels are in DM; handed to the DM integration agent. |
| build | green at a6256d8 | | tsc, eslint, build OK; vitest 256 passed / 2 skipped | |
| #43–#44 message requests | in progress | | | Composer 2.5 |
| #11–#13 safety | done | 2cb71b8 | 8 PGlite + 1 jsdom | Coordinator mounted Block / Report buttons on `/app/profile/[username]` (otherwise blocking had no entry point). Group report review (`list_group_reports`, `mark_report_reviewed`) lives here; groups #38 should reuse it. |
| #16–#17 notifications | done | 858b71a | 9 PGlite + 3 unit; ports suite still green | `notify` gains `notifications.skipped_mentions_only`; coordinator added it to the typed port. |
| DM review fixes | done | a9aa685 | 3 regression tests, each shown failing on the old SQL | From an independent SQL review: `send_text` ignored blocks in an existing direct chat; `get_conversation` exposed the other read cursor with receipts off; previews ignored delete-for-me; concurrent same-client-id sends raised instead of returning the row (fixed, not testable in single-connection PGlite). Open product question: blocks are not enforced inside shared groups (spec silent). |
| verification | green at a9aa685 | | clean worktree `../chatapp-verify`: build OK, vitest 201 passed / 2 skipped, Playwright 6 passed / 1 skipped | Worktree `node_modules` is a junction to the main tree: remove it with `cmd /c rmdir` BEFORE `git worktree remove`. Use `PULSE_TEST_MIGRATIONS_UNTIL=<prefix>` to test in the shared tree while later migrations are unfinished. |
| #18–#20 discovery | done | 53f0c5f | 12 PGlite service tests | Username search lives on `/app/contacts` per spec. Coordinator fixes: internal helpers (`discovery_shared_groups`, recent-search writers, profile builder) were callable by any signed-in user and leaked shared groups / allowed writing others' history — now revoked; added `tests/db/function-grants.test.ts` guard; generator scanned the wrong folder (`./features`); `createUser` now coexists with the identity signup trigger. `is_online` stays false on profile pages (live presence is the typing-presence feature). |
| #3 | done | 747577d | lint, typecheck, unit tests, build; Playwright smoke 4 passed, 1 skipped (authenticated shell needs a live Supabase) | Coordinator fixes: landing now follows the visitor's locale (it always showed Arabic copy) with localized legal links; locale and theme share one cached profile lookup per request |
| #5 | done | 3661afb | workflow YAML parsed; not run on GitHub (nothing pushed) | Coordinator fixed the migrations job to use the installed CLI binary |
| #6 | done | c212df2 | 29 unit tests, ESLint clean | Coordinator closed a leak: `Error` objects nested in event properties now drop their message |
