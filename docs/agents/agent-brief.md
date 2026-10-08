# Brief for feature agents (read fully before coding)

Pulse is a username-first realtime chat. Next.js 15 App Router + React 19 + TypeScript (`src/`, alias `@/*`), Supabase (Auth, Realtime, Storage) on PostgreSQL, next-intl, Zod, Lucide, Vitest, Playwright. Read `docs/agents/architecture.md`, `docs/agents/progress-ledger.md` (coordinator decisions), `.scratch/platform-foundation/spec.md`, your own spec under `.scratch/<feature>/spec.md`, and your GitHub issues (`gh issue view <n>`).

## Working rules

- The shell sandbox is broken on this machine: every Shell call must pass `required_permissions: ["all"]`.
- Do not run git write commands (add, commit, checkout, stash, reset). The coordinator commits.
- Do not install or remove packages, and do not edit `package.json`.
- Other agents work in the same tree at the same time. Only edit files you own: your feature folder `src/features/<feature>/`, your migration files, your tests, and the bodies of the routes your spec owns. Never edit `src/shell/**`, `src/platform/**`, `src/i18n/**`, `scripts/**`, existing migrations, or another feature's folder. If you truly need a change there, stop and describe it in your final report instead.
- Do not run `npm run build`, `next dev`, `next start`, or Playwright; the coordinator runs them once for everyone. Never kill all node processes.
- Verify with: `npm run gen:features`, `npx tsc --noEmit`, `npx eslint <your paths>`, `npx vitest run <your paths>`. If a failure is in a file you don't own, report it instead of fixing it.
- Never invent requirements. Implement what the issue's acceptance criteria and spec say. If something can't be done here, say so with the reason.

## Data access (mandatory)

- App code never reads or writes tables directly with `.from()`. All data access is `supabase.rpc(fn, args)` through `callRpc` from `@/platform/rpc` (returns `Result<T>`). Services take an `RpcClient` as their first argument so tests can pass the PGlite client.
- Writes are PostgreSQL functions in **your own new migration** (`supabase/migrations/<your prefix>_<name>.sql`): `language plpgsql security definer set search_path = ''`, fully qualified names (`public.x`), arguments prefixed `p_`, first check `auth.uid()` is not null (raise `platform.unauthenticated`), then authorize. Raise errors as `raise exception '<feature>.<code>' using errcode = 'P0001';` — the message is the stable error code.
- Reads that should respect RLS can be `security invoker` SQL functions. When a read must show data RLS would hide (for example display names of members in a shared conversation), write a `security definer` function that checks membership and returns only the needed columns.
- Internal helper functions (anything taking a user id the caller could fake, or that writes on someone's behalf) must end with `revoke all on function ... from public, anon, authenticated;`. `tests/db/function-grants.test.ts` fails when a security-definer function callable by `authenticated` has no `auth.uid()` check, or when `anon` can call an unreviewed function; run it.
- Default privileges already make new functions executable by `authenticated` and `service_role` only, and new tables select-only for browser roles. Do not `grant` to `anon` unless the spec requires an anonymous read (for example a public profile page), and say so in your report.
- Existing helpers: `public.is_member(conversation_id, user_id default auth.uid())`, `public.decide_interaction(actor, target, action)` (an authenticated caller must pass `actor = auth.uid()`), `public.direct_pair_key(a, b)`, `public.normalize_username(text)`, `public.username_is_valid(text)`, `public.notify(recipient, type, actor, entity, conversation default null, mention default false)` (server-side only; call it from your definer functions), `public.enforce_rate_limit(action)` (call first in writes that are rate limited: `send_message`, `search_users`, `create_conversation`, `submit_report`, `start_upload`).
- Storage: the `attachments` bucket is private with no client policies. Uploads and signed URLs go through server code using `createSupabaseAdminClient` from `@/platform/supabase/admin` after your service has authorized the caller; the server generates the object path. Auth flows (sign up, sign in, sign out, sessions) use `supabase.auth` directly.
- TS ports in `src/platform/`: `result.ts`, `rpc.ts`, `username.ts`, `interaction.ts`, `notify.ts`, `limit.ts`, `media.ts`, `realtime.ts` (channel names), `realtime-hub.ts` (**always** join `conversation:{id}` / `inbox:{userId}` through `joinConversation` / `joinInbox`, never `supabase.channel()` directly), `composer-events.ts` (composer activity signal), `pagination.ts`, `timeline.ts` (`TimelineMessage`), `session.ts` (`getSessionContext()` for server components and server actions: `{ userId, supabase, rpc }` or null).

## Feature module layout

```
src/features/<feature>/
  contributions.tsx   // export const contributions: FeatureContributions (from "@/shell/slots/types"); must be safe to import in client components
  messages/{ar,en,fr}.json   // namespace = folder name; use useTranslations("<feature>") / getTranslations("<feature>")
  service.ts          // (rpc: RpcClient, ...) => Promise<Result<T>>
  actions.ts          // "use server" server actions: getSessionContext() then call the service
  context/            // React Context + useReducer for client state
  components/         // functional components; presentational ones wrapped in memo
  *.test.ts(x)        // beside the code
```

- Contributions are discovered automatically by `scripts/gen-features.mjs`; there is no registry to edit. Nav items for routes already in the shell rail (home, chats, groups, search, contacts, notifications, settings) must not be duplicated; a nav contribution whose `id` equals a shell item id replaces it (use this only to add a `badge`).
- Route pages you own: replace the `RouteFrame` body, keep pages thin (server component that reads data via your service and renders your components). Next 15 route `params` are Promises.
- Arabic is the default and renders RTL. Provide `ar`, `en`, `fr` for every key; English is the reference meaning. Use ICU interpolation and plurals; never concatenate translated fragments. Format dates/numbers with `Intl` only.
- Styling: plain CSS (CSS Modules `*.module.css` inside your feature are fine) using the tokens in `src/shell/styles/tokens.css`. Spacing only `var(--space-8|12|16|24)`. Logical properties only (`margin-inline-start`, `padding-inline`, `inset-inline`). Lucide icons; every icon-only button has an accessible name. Motion is disabled under `prefers-reduced-motion`.
- Client state: Context + `useReducer`. Effects idempotent with cleanup. No side effects in render.

## Tests

- Service tests run on PGlite: `createTestDb()` and `createUser(db, { username })` from `tests/db/pglite.ts`, `createRpcClient(db, userId)` from `tests/db/rpc-client.ts` (behaves like `supabase.rpc` as that user, through RLS). Put them at `tests/db/<feature>.test.ts` or beside your service. Assert the returned `Result` and what a second user can or cannot read.
- Pure helpers get unit tests. Components may use `// @vitest-environment jsdom` with Testing Library.
- Browser journeys are a later ticket; do not write Playwright tests unless your issue asks for them.

## Final report

Return: issues covered and each acceptance criterion as met / not met (with reason), files created or changed, SQL functions with their grants, test commands and counts, and anything you need changed outside your files.
