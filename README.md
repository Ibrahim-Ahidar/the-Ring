# Pulse

Pulse is a username-first realtime chat app: find people by username, start a conversation, and keep communication organized.

Spec map for parallel work: [.scratch/README.md](.scratch/README.md). Agent architecture conventions: [docs/agents/architecture.md](docs/agents/architecture.md). Operator details (CI, env, backups): [docs/operations/README.md](docs/operations/README.md).

## Requirements

- Node.js 24+
- npm 11+
- Docker (optional, for `npx supabase start` local stack)
- Without Docker, SQL migration tests can run on embedded PostgreSQL via `@electric-sql/pglite` (see harness under `tests/`)

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

Optional:

| Variable | Scope | Description |
| --- | --- | --- |
| `SENTRY_DSN` | Server / browser (when configured) | Optional error reporting; see `src/platform/telemetry/`. Empty means no reporting. |

Copy [.env.example](.env.example) and set all required values. The app refuses to start (`next dev` / `next start`) if any required variable is missing. Production `next build` does not require env vars; validation runs at server startup via `src/instrumentation.ts`.

Do not commit `.env` files with secrets. CI does not use production keys; see [docs/operations/ci.md](docs/operations/ci.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest unit and service tests |
| `npm run test:e2e` | Playwright browser tests (local only for now; not in CI) |

## Supabase and migrations

Configuration lives under `supabase/` (project id `pulse`). Versioned schema changes belong in `supabase/migrations/`. Seed data, when used, is configured in `supabase/config.toml` (`[db.seed]`).

With Docker:

```bash
npx supabase start
npx supabase db reset   # apply migrations + seed.sql when present
```

Copy the local API URL, anon key, and service role key from `supabase status` into `.env.local`.

Storage buckets, Auth, Realtime, and PostgreSQL are enabled in `supabase/config.toml`. Email confirmations are enabled under `[auth.email]`.

**Storage policy:** user attachment buckets must stay **private**; access via RLS and signed URLs, not public bucket ACLs.

Without Docker, do not run `supabase start` on this machine; use a hosted Supabase project for integration, and rely on PGlite-backed tests for migration SQL where the harness supports it.

## Tests

- **Unit and service tests:** `npm test` (Vitest). Many SQL tests use PGlite and do not require Docker.
- **Browser / e2e:** `npm run test:e2e` (Playwright) needs env vars and a dev server against a live Supabase (local stack or hosted). **CI does not run Playwright yet** — see [docs/operations/ci.md](docs/operations/ci.md).

## Continuous integration

On every pull request and on pushes to `main`, GitHub Actions runs lint, typecheck, test, build, and a separate job that applies migrations against the Supabase CLI local stack (Docker). Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Android release (APK)

Pushing a `mobile-v*` tag runs [.github/workflows/android-release.yml](.github/workflows/android-release.yml): it runs `expo prebuild`, builds a signed release APK with Gradle on the runner (no EAS), and attaches it to a GitHub Release for the tag. The keystore is never committed; it is read from GitHub Actions secrets. These are manual steps for the maintainer:

1. Generate a keystore once and keep it somewhere safe (losing it means users cannot update in place):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore \
     -alias thering -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.keystore > release.keystore.b64   # macOS: base64 -i release.keystore
   ```

2. In the repository, go to Settings, Secrets and variables, Actions, and add:
   - `ANDROID_KEYSTORE_BASE64`: contents of `release.keystore.b64`
   - `ANDROID_KEYSTORE_PASSWORD`: the keystore password
   - `ANDROID_KEY_ALIAS`: the alias (`thering` above)
   - `ANDROID_KEY_PASSWORD`: the key password

3. Tag and push. The workflow writes the tag version into `app.json` (`expo.version`) and sets `expo.android.versionCode` to major*10000+minor*100+patch, so no version bump commit is needed:

   ```bash
   git tag mobile-v0.2.0
   git push origin mobile-v0.2.0
   ```

4. Tell installed apps about the release by setting `mobile_latest_version` (and `mobile_download_url`, the Release asset link) in the `app_config` table with the service role. Apps older than that show a dismissible update notice; apps older than `min_supported_mobile_version` are blocked by the update gate.

## Deploy to Vercel

1. Connect the repository to Vercel (Next.js preset).
2. Set required environment variables in the Vercel project settings (same names as `.env.example`).
3. Deploy; the build step does not need secrets, but the running deployment must have all required vars or the server will fail fast at boot.

## Error reporting

When `SENTRY_DSN` is set, the platform telemetry module (`src/platform/telemetry/`) can forward unexpected errors. With no DSN, reporting is a no-op. Service errors must not log message bodies or other chat content — only stable codes and ids.

## Backup and restore

For a hosted Supabase project, database recovery is a Supabase **project-level** backup/restore operation (and point-in-time recovery only if your plan provides it). This portfolio does not automate vendor backup jobs beyond documenting that expectation. Storage objects are managed separately from SQL backups. Details: [docs/operations/backups.md](docs/operations/backups.md).

## Health

Treat the app as up when the Node process is running and required environment variables passed startup validation. There is no dedicated health HTTP endpoint unless a later spec adds one.
