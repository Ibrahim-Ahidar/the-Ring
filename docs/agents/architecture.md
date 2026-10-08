# Pulse agent architecture

Conventions for tickets after the platform foundation. Follow these paths and boundaries so parallel agents do not collide.

## Top-level layout

| Path | Role |
| --- | --- |
| `src/app/` | Next.js App Router routes and route layouts |
| `src/platform/` | Shared contracts: env validation, Supabase clients, `Result` type, ports (predicate, limit, notify), shared constants |
| `src/shell/` | Application shell layout, slot loader, shell i18n catalogs |
| `src/features/<feature>/` | One module per product feature |
| `supabase/migrations/` | Versioned SQL schema and RLS |
| `tests/` | Shared test harness (DB reset, `createUser`, PGlite or local stack) |
| `e2e/` | Playwright browser journeys |

## Feature module shape

Each feature under `src/features/<feature>/` typically includes:

- `contributions.tsx` — slot contributions (`nav`, `overlay`, `composerTool`, etc.)
- `messages/{ar,en,fr}.json` — feature catalogs (not shared with other features)
- `service.ts` — application service functions returning `Result<T>`
- `components/` — UI for that feature
- `context/` — React Context + `useReducer` for client state
- `*.test.ts` / `*.test.tsx` — tests beside the code they cover

Do not edit another feature's module, catalogs, or migrations owned elsewhere.

## Server vs client

- `import "server-only"` on modules that read secrets or use the service role (`src/platform/env/server.ts`, `src/platform/supabase/admin.ts`, server Supabase client).
- Browser code uses the anon key via `src/platform/supabase/browser.ts` only.
- Required env vars are validated at startup in `src/instrumentation.ts`.

## Services and errors

All application services return:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } };
```

User-facing copy comes from i18n catalogs; error codes are stable strings (e.g. `identity.username_taken`).

## i18n and RTL

- Default locale: Arabic (`ar`), RTL.
- English (`en`) is the reference meaning for keys; French (`fr`) ships for shell and features.
- Shell strings live under `src/shell/`; feature strings stay inside each feature module.
- Use logical CSS properties; set `dir` from locale.

## UI conventions

- Functional components only; presentational components wrapped in `React.memo`.
- Derived values: `useMemo` / `useCallback`.
- Effects idempotent with cleanup.
- Spacing: 8, 12, 16, 24 px. One accent, Lucide icons, accessible names on icon-only controls.

## Database

- Single system of record: PostgreSQL via Supabase.
- Foundation migration owns core schema; later specs add new migrations only when needed (e.g. indexes with evidence).
- RLS on every table; tests use user-scoped clients, not bypassing policies in feature code.

## Testing

- Prefer service tests: call public operations with authenticated harness users, assert `Result` and what a second user can read.
- Do not assert SQL strings or private component internals in feature tests.
- Browser smoke and journeys live in `e2e/` when required by the browser-journeys spec.
