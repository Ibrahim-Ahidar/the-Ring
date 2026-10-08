# Pulse: browser journeys

**Status:** ready-for-agent

**Wave:** 3

**Blocked by:** identity, safety, locale-appearance, discovery-contacts, direct-messaging, typing-presence, message-actions, reactions, media, groups, message-requests

**Owns:** Playwright journeys that prove the product paths a person can see. This spec adds no product behavior.

**Must not edit:** feature services, schema, or copy except to add a stable accessible name or test id when a journey cannot find a control that the owning spec already required. Prefer role and accessible name. If a journey fails because a feature is wrong, report the failure; do not reimplement the feature in this spec.

## Problem Statement

Each feature is tested at its service, so a member can still be broken at the screen: realtime between two sessions, right-to-left layout, a failed send, or a group admin path. Pulse needs a small set of browser journeys that walk those paths the way a person would.

## Solution

Automate the portfolio demo paths in a real browser, including two sessions where the path is about delivery. The journeys cover first contact, realtime text, rich message actions, media, groups, block and report, locale direction, reconnect without duplicate sends, a narrow viewport, and keyboard-only chat. They assert observable outcomes.

## User Stories

1. As a reviewer, I want a new member to sign up, choose a username, find a seeded member, and send a message, so that first contact works in the browser.
2. As a reviewer, I want two browser sessions to exchange text without a reload, so that realtime delivery is visible.
3. As a reviewer, I want a reply, a reaction, an edit, and a delete-for-everyone to show on both sessions, so that rich messages reconcile.
4. As a reviewer, I want an image upload to show progress or a completed image and to appear in shared media, so that attachments work in the browser.
5. As a reviewer, I want to create a group, invite a member, promote them to admin, and see them in the member list, so that the group path works.
6. As a reviewer, I want a block to hide the blocked person from username search and to refuse a new direct message, so that safety is visible.
7. As a reviewer, I want a report submission to show a received state, so that the reporter gets feedback.
8. As a reviewer, I want switching from English to French to Arabic to change shell language and to set RTL only for Arabic, so that localization is real.
9. As a reviewer, I want a send started while offline to remain unsent and, after reconnect, a single retry to produce one message, so that failure handling does not duplicate.
10. As a reviewer, I want the chat list and thread to be usable at a mobile viewport, including back navigation, so that the narrow layout works.
11. As a reviewer, I want to reach the composer and send a message using the keyboard only, so that the core path has focus and accessible names.
12. As a reviewer, I want typing in one session to show a typing label in the other and then clear, so that the ephemeral indicator expires or stops.
13. As a reviewer, I want a message request, when the recipient requires requests, to stay out of the main chat list until accepted, so that the request path is visible.

## Implementation Decisions

- Use the foundation Playwright harness. Tests sign up through the UI or create users through a test-only setup endpoint that already exists for the service harness. Do not add a backdoor that bypasses row-level security in the running app. A setup helper that inserts users with the service role outside the browser is allowed.
- Two sessions mean two browser contexts signed in as different members.
- Offline is emulated with the browser's network disable for the application origin, then re-enabled. The assertion is one message row after a single retry, observed in the UI as a single bubble and confirmed by a service read if the test helper can query as the member.
- Locale journey: change language in the settings screen this product ships. Assert `dir` and one translated shell string per locale. Arabic is RTL. English and French are LTR.
- Mobile journey: viewport 390 by 844. Open a chat, go back to the list, open settings.
- Keyboard journey: tab to the composer, type, send with the keyboard, and assert the message appears. Do not click.
- Seed the minimum accounts inside the test. Do not commit real personal data. Do not add a public demo password to the README in this spec.
- Accessible selectors: role, name, and text. Add `data-testid` only when a control the owning spec required still has no accessible name, and keep that edit to the attribute.
- These tests may run in CI as a separate job. If the environment cannot host Supabase and the app together, document the job as manual and keep it green locally. Do not delete service tests to make CI pass.
- Do not assert on animation frames, pixel colors, or reducer state.

## Testing Decisions

This spec is the test. A good journey fails when the user-visible outcome is wrong and passes without depending on private structure.

Each story above is one test or one clearly named step in a file grouped by journey: first contact, realtime, rich message, media, group, safety, locale, reconnect, mobile, keyboard, typing, message request.

Prior art is the foundation shell smoke and the single Arabic render tests in feature specs. Journeys replace the need for those feature specs to grow full browsers. Do not duplicate their service assertions here.

## Out of Scope

- Visual regression snapshots.
- Load tests and chaos tests beyond one offline window.
- Voice-note microphone capture in CI.
- New product features, copy rewrites, or schema changes.
- Portfolio screenshots and the case-study page.

## Further Notes

Implement this spec only after every blocking spec is merged. When a journey fails, fix the test if the selector is wrong. If the product is wrong, stop and name the owning spec instead of patching around it in the journey.
