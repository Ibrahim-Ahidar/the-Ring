# Pulse — operations

Operator-focused notes for running Pulse in development and on hosted infrastructure. Product and agent conventions live in [docs/agents/architecture.md](../agents/architecture.md).

| Topic | Document |
| --- | --- |
| Environment variables and secrets | [environment.md](./environment.md) |
| CI pipeline (what runs, what is skipped) | [ci.md](./ci.md) |
| Database backup and restore | [backups.md](./backups.md) |

Continuous integration is defined in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). It never uses production Supabase credentials.

## Timing tool and weekly size record (issue #215)

Spec: [local-first-e2ee.md section 11](../specs/local-first-e2ee.md). The timing tool is development-only: it is compiled out of production builds.

**Run it (web / desktop).** `npm run dev` in `apps/web` (any build where `NODE_ENV !== "production"`; a production build only includes it with `NEXT_PUBLIC_PULSE_TIMING=1`). Open the browser console: every new sample prints a table, and `window.__pulseTiming.summaries()` returns p50/p95 per metric (`send-to-arrival`, `tap-to-bubble`, `chat-open`, `cold-start`). `__pulseTiming.clockOffsetMs()` is the client/server offset from the `server_now()` RPC (apply migration `20261024000000_server_now.sql` to the project first). Send-to-arrival needs two Devices on different clients: send from one, read the other's console.

**Run it (mobile).** Dev builds only (`__DEV__`); samples are logged to the Metro console with the tag `[pulse-timing]`.

**Weekly size record.** Once a week run [db-size.sql](./db-size.sql) and add a row:

| Date | Database size | Largest table | Egress this month |
| --- | --- | --- | --- |
| (to fill) | | | |

Egress is not in SQL: read it from the Supabase dashboard, Project > Settings > Usage > "Egress" (current billing cycle), and copy the figure into the same row.
