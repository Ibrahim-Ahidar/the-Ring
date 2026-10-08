# Environment variables

Pulse validates required configuration when the Next.js server starts (`next dev` / `next start`). A production **`next build`** can complete without these values; missing vars still fail at runtime boot via `src/instrumentation.ts`.

## Required

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public (browser bundle) | Canonical app URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon (JWT) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Service role key for privileged server operations; never expose to the client or commit to git |

Copy [.env.example](../../.env.example) to `.env.local` and fill all four. Do not commit `.env`, `.env.local`, or any file containing real keys.

## Optional

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | Server (and browser when wired) | When set, unexpected errors can be reported through the platform telemetry module (`src/platform/telemetry/`). When empty, reporting no-ops. |

## Vercel deployment

Set the same variables in the Vercel project **Environment Variables** UI. Map `NEXT_PUBLIC_*` to Production and Preview as needed. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only (never prefix with `NEXT_PUBLIC_`). Use your hosted Supabase project URL and keys, not the local stack values from `supabase status`.

## Storage buckets

Attachment and media specs assume **private** Supabase Storage buckets with access enforced by RLS and signed URLs. Do not mark user-content buckets `public` in Supabase or in `supabase/config.toml` without an explicit product decision and security review.

## Health

For this portfolio, “healthy” means the Node process is running and required environment variables passed validation at startup. There is no separate public health route unless a later spec adds one.
