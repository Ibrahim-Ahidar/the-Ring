# Continuous integration

Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

Triggers: every pull request, and pushes to `main`.

## Job: Lint, typecheck, test, build

Runs on `ubuntu-latest` with Node.js 24 and npm cache.

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test` — Vitest unit and service tests (including SQL checks on embedded PostgreSQL / PGlite where the harness uses it)
5. `npm run build` — production Next.js build

This job does **not** set Supabase or production secrets. It does not print a service role key.

## Job: Supabase migrations (local stack)

Runs on `ubuntu-latest` with Docker (GitHub-hosted runners include it).

1. `npx supabase start` — local stack from [`supabase/config.toml`](../../supabase/config.toml)
2. `npx supabase db reset` — apply migrations under `supabase/migrations/` and seed when configured
3. `npx supabase db lint` — static checks against the local database
4. `npx supabase stop --no-backup` — teardown (runs even if earlier steps fail)

Keys emitted by the local CLI are for the ephemeral CI stack only, not production.

## Not in CI (by design)

- **Playwright / browser journeys** (`npm run test:e2e`): require a running dev server and valid env vars pointing at a live Supabase project or local stack. Wave-1 CI intentionally skips them so the pipeline stays green without a shared live environment. Run e2e locally after `cp .env.example .env.local` and `npx supabase start` (or a hosted project).
- **Production deploy**: Vercel deploys are not triggered from this workflow.

When the [browser-journeys](https://github.com/Ibrahim-Ahidar/the-Ring) spec is implemented, a follow-up can add a gated e2e job with dummy or CI-specific Supabase credentials.
