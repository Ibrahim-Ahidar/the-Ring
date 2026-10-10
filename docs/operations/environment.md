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

## Auth email (signup codes)

Signup is confirmed with a 6-digit code the member types into the app; the email must not contain a link. The built-in Supabase mailer only delivers to project team members and is capped at a few emails per hour, so staging and production need custom SMTP. These are manual steps in the hosted Supabase dashboard:

1. **Auth > SMTP Settings**: enable custom SMTP with a real provider (Resend, Postmark, or SES). Set host, port, user, password (the provider API key), sender email on a verified domain, and sender name `Pulse`.
2. **Auth > Rate Limits**: raise "emails sent per hour" above the default once SMTP is on.
3. **Auth > Email Templates > Confirm signup**: paste [supabase/templates/confirmation.html](../../supabase/templates/confirmation.html). It uses `{{ .Token }}` only, never `{{ .ConfirmationURL }}`.
4. **Auth > Providers > Email**: keep "Confirm email" on and the email OTP length at 6. The template says the code expires in one hour (`otp_expiry = 3600`); update both if you shorten it.
5. **Auth > URL Configuration**: Site URL is the production origin; redirect URLs include `<origin>/auth/callback` (still used by password reset).

Locally, `supabase/config.toml` registers the same template and Inbucket/Mailpit catches the mail.

## Storage buckets

Attachment and media specs assume **private** Supabase Storage buckets with access enforced by RLS and signed URLs. Do not mark user-content buckets `public` in Supabase or in `supabase/config.toml` without an explicit product decision and security review.

## Health

For this portfolio, “healthy” means the Node process is running and required environment variables passed validation at startup. There is no separate public health route unless a later spec adds one.
