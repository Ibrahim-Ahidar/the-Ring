# Database backup and restore

Pulse stores application data in **PostgreSQL** via Supabase. File attachments live in **Supabase Storage** (private buckets).

## Hosted Supabase (portfolio / production)

- **Backups**: Rely on Supabase project backups provided by the hosted plan. Enable and verify backup settings in the Supabase dashboard for the project you deploy against.
- **Restore**: Database recovery is a **project-level** operation in Supabase (restore from backup or point-in-time recovery when your plan includes PITR). This repository does not automate vendor backup jobs or cross-region replication.
- **Storage**: Object storage is separate from SQL backups. Restoring the database does not automatically restore Storage objects; plan accordingly if you test disaster recovery.

## Local development

`npx supabase start` data lives in Docker volumes on your machine. It is not a substitute for hosted backups. Use `npx supabase db reset` to reapply migrations from git, not as a backup tool.

## Secrets

Backup exports and service role keys must stay out of git and CI logs. Operators rotate keys in Supabase if a secret is exposed.
