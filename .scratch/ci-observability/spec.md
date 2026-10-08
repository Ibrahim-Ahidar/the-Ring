# Pulse: CI, observability, and environment safety

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** the continuous integration workflow, the error-reporting hook, and the operator docs for environment, backups, and local development.

**Must not edit:** feature modules, the foundation migration's schema, product copy, or application behavior. You may add CI config, a thin telemetry wrapper, and documentation. Do not add product dependencies beyond what the foundation already installed, except an error-reporting SDK if it is loaded only on the server and in the browser behind the existing optional DSN. If adding that SDK would change the lockfile, that is the one allowed manifest edit, limited to that SDK.

## Problem Statement

Nothing checks that Pulse still builds, typechecks, and passes tests when several agents merge at once. Failures in the running app are not reported, and a new contributor cannot see which environment variables and backup expectations the app requires.

## Solution

Pull requests run install, lint, typecheck, unit and service tests, and a production build. The app reports unexpected errors to an error tracker when a DSN is configured, and stays quiet when it is not. Docs list environment variables, the local run steps, and how database backups are expected to work for a portfolio deployment. Demo data is not seeded here.

## User Stories

1. As a contributor, I want a pull request to fail when lint fails, so that agents do not merge broken style.
2. As a contributor, I want a pull request to fail when typecheck fails, so that contract drift is caught.
3. As a contributor, I want service tests to run in CI, so that the foundation harness and any merged feature tests execute.
4. As a contributor, I want the production build to run in CI, so that a type-only success cannot hide a build break.
5. As a contributor, I want CI to use environment values that are not real production secrets, so that logs stay safe.
6. As a contributor, I want the pipeline to skip browser journeys until that spec says they are required, so that wave-1 CI stays green without every feature.
7. As an operator, I want missing required environment variables to still fail the app at boot, so that CI does not weaken the foundation check.
8. As an operator, I want optional error-reporting configuration, so that production can send exceptions without forcing every local run to have an account.
9. As an operator, I want unexpected service errors logged with the error code and without message bodies, so that chat content never lands in logs.
10. As an operator, I want a short backup and restore note for the database, so that the portfolio can explain recovery without automating a cloud vendor beyond Supabase's backup expectation.
11. As a contributor, I want local development steps in the repository readme, so that install, env, migrations, and tests are discoverable.
12. As a contributor, I want the readme to state the product in one sentence and point at the spec map, so that an agent or reviewer knows where work lives.
13. As an operator, I want a documented rule that storage buckets stay private, so that a later change does not casually make attachments public.
14. As an operator, I want health of the app described as process up plus a successful configuration check, so that "it deployed" has a meaning.

## Implementation Decisions

- Workflow on pull request and on the main branch: install, lint, typecheck, test, build. Tests are the Vitest service suite. Playwright is installed but the workflow runs only a shell smoke if the foundation smoke is stable without secrets; if the smoke needs a live Supabase that CI does not have, run the service tests that use the local test database and document the missing live step rather than failing the pipeline on an absent secret.
- Prefer the Supabase local stack or the foundation's documented test database. Do not point CI at production.
- Telemetry wrapper: `reportError(error, context)` and `reportEvent(name, properties)`. Event names allowed in this spec are `app.error` only, plus a pass-through so later features can send the portfolio events (`signup_completed`, `username_created`, `conversation_started`, `message_sent`, `message_failed`, `attachment_uploaded`, `group_created`, `search_used`, `language_changed`, `report_submitted`) without this spec instrumenting those flows. Properties must be ids and codes, never message bodies, bios, or report details. When `SENTRY_DSN` is empty, both functions no-op. Do not add analytics that store message content.
- The wrapper is the only application code this spec adds. Feature specs are not edited to call it.
- README covers: one-sentence description, how to install, required and optional env vars, how to run migrations, how to run tests, where `.scratch/README.md` lists specs, and a backup note: Supabase project backups are the recovery mechanism, restore is a project-level operation, and this portfolio does not claim point-in-time restore unless the hosted project has it enabled. Demo accounts are out of scope and must not contain real personal data when they are added later.
- Do not commit `.env` files with secrets. The example file from the foundation stays values-empty.
- CI must not print the service-role key.

## Testing Decisions

A good test here is the pipeline config being valid and the telemetry wrapper's behavior. Unit-test the wrapper: with no DSN, `reportError` and `reportEvent` resolve and do not throw; `reportEvent` drops a property named `body`, `text`, `bio`, or `details` if a caller passes one; other properties pass through to the sink when a fake sink is injected.

Do not assert on GitHub's servers. Do not start a live production deploy from tests.

No prior CI tests. Keep this file's tests local and pure.

## Out of Scope

- Implementing product features to make the suite larger.
- Seeding demo accounts, screenshots, or the case-study site.
- Provisioning a custom domain, paid log storage, or uptime vendor.
- Performance load tests.
- Editing feature code to emit product analytics. The wrapper is ready for them.

## Further Notes

Implement this spec only. If the test suite is already red because another in-flight branch is not merged, do not "fix" that feature. CI should be green on the foundation plus this spec alone.
