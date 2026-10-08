# Pulse — operations

Operator-focused notes for running Pulse in development and on hosted infrastructure. Product and agent conventions live in [docs/agents/architecture.md](../agents/architecture.md).

| Topic | Document |
| --- | --- |
| Environment variables and secrets | [environment.md](./environment.md) |
| CI pipeline (what runs, what is skipped) | [ci.md](./ci.md) |
| Database backup and restore | [backups.md](./backups.md) |

Continuous integration is defined in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). It never uses production Supabase credentials.
