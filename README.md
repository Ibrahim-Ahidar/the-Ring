# Pulse

Pulse is a username-first realtime chat app: find people by username, start a conversation, and keep communication organized.

Spec map for parallel work: [.scratch/README.md](.scratch/README.md). Agent architecture conventions: [docs/agents/architecture.md](docs/agents/architecture.md).

## Requirements

- Node.js 24+
- npm 11+
- Docker (optional, for `npx supabase start` local stack)
- Without Docker, SQL migration tests can run on embedded PostgreSQL via `@electric-sql/pglite` (see future harness in `tests/`)

## Install

```bash
npm ci
cp .env.example .env.local
# Fill in values from your Supabase project or local stack
```

## Environment variables

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public (browser) | Canonical app URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (browser) | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (browser) | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Supabase service role key; never expose to the client |

Copy [.env.example](.env.example) and set all four values. The app refuses to start (`next dev` / `next start`) if any required variable is missing. Production `next build` does not require env vars; validation runs at server startup via `src/instrumentation.ts`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest unit and service tests |
| `npm run test:e2e` | Playwright (requires env and dev server) |

## Supabase local stack

Configuration lives under `supabase/` (project id `pulse`).

With Docker:

```bash
npx supabase start
npx supabase db reset   # apply migrations + seed.sql when present
```

Copy the local API URL, anon key, and service role key from `supabase status` into `.env.local`.

Storage buckets, Auth, Realtime, and PostgreSQL are enabled in `supabase/config.toml`. Email confirmations are enabled under `[auth.email]`.

Without Docker, do not run `supabase start` on this machine; use a hosted Supabase project for integration, and rely on PGlite-backed tests for migration SQL where the harness supports it.

## Backup note

For a hosted Supabase project, database recovery is a Supabase project-level backup/restore operation. This portfolio does not automate vendor-specific backup jobs beyond documenting that expectation.
