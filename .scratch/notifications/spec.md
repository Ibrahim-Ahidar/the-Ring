# Pulse: in-app notifications

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/app/notifications`, `/app/settings/notifications`, and the notifications application service for listing, reading, and preferences.

**Must not edit:** the `notify` port, the foundation migration, the shell layout, or the package manifest. Producers call `notify`. This spec reads and updates notification rows and preferences.

## Problem Statement

When something happens that should alert a member, there is no inbox and no way to turn in-app notifications on or off. The foundation can insert a notification row, but a member never sees it.

## Solution

A notifications destination lists the member's in-app notifications, marks them read, and links to the related conversation or profile when that route exists. Notification settings control in-app delivery, a stored push preference, and a mentions-only preference. Mute is honored by the existing `notify` port; this spec explains mute and does not reimplement it.

## User Stories

1. As a member, I want a notifications destination in the shell, so that alerts are not buried in settings.
2. As a member, I want my notifications newest first, so that the latest event is at the top.
3. As a member, I want an unread count of notifications, so that I can see that something new arrived.
4. As a member, I want to open a notification and land on the related conversation or profile when an id is present, so that I can act on it.
5. As a member, I want opening a notification to mark it read, so that the unread count drops.
6. As a member, I want to mark all notifications read, so that I can clear the badge in one action.
7. As a member, I want a notification that is already read to stay in the list, so that I can look back.
8. As a member, I want an empty inbox explained, so that a new account does not look broken.
9. As a member, I want loading and error states on the inbox, so that a failed fetch is recoverable.
10. As a member, I want to turn in-app notifications off, so that `notify` stops creating rows for me.
11. As a member, I want turning in-app notifications back on to apply to future events, so that old skipped events are not backfilled.
12. As a member, I want a push preference stored, so that a later push spec has a value to read. I do not expect browser push to be sent now.
13. As a member, I want a mentions-only preference stored, so that group mentions can honor it later.
14. As a member, I want another member's notifications to be invisible to me, so that alerts stay private.
15. As a member, I want a muted conversation not to create a notification when `notify` is called for it, so that mute works before the mute button exists. The mute control itself is the organization spec.
16. As a member, I want notification copy in Arabic, English, and French, with counts pluralized, so that "1 unread" and "2 unread" are grammatical in each locale.
17. As a member, I want the inbox usable from the keyboard, so that I can move through items and activate one.
18. As a member, I want a realtime insert on my inbox channel to add the new row without refresh, so that an alert appears while I am looking at the list.
19. As a member, I want a duplicate delivery of the same notification id to show one row, so that reconnect does not duplicate alerts.
20. As a member, I want pagination when I have a long history, so that the first paint does not load every row.

## Implementation Decisions

- Service operations: `listNotifications({ cursor })`, `unreadCount`, `markRead(id)`, `markAllRead`, `getPreferences`, `updatePreferences`.
- List order is `created_at` descending, page size 30, cursor on `(created_at, id)`.
- `markRead` sets `read_at` for the caller's row. Another member's id returns `notifications.not_found`. `markAllRead` updates only the caller's unread rows.
- Preferences write `in_app_enabled`, `push_enabled`, and `mentions_only` on the caller's `notification_preferences` row, creating it if needed. This spec does not send web push when `push_enabled` is true.
- `mentions_only` is stored and returned. `notify` gains an optional `mention` boolean that defaults to false. When `mentions_only` is true and `mention` is not true, `notify` skips the insert. Existing callers keep working because the default is false, which means a member who turns mentions-only on stops receiving non-mention notifications. That is the meaning of the preference. This is the only allowed change to `notify`.
- The inbox subscribes to `inbox:{userId}` notification inserts and prepends by id.
- Client state is a notifications context and reducer. Rows are memoized.
- Catalogs in Arabic, English, and French include plural unread counts. Relative time uses `Intl` and the active locale.
- Empty, loading, and error states are required. Errors show a retry action.
- Navigation contribution: notifications destination.

## Testing Decisions

Service tests: a recipient lists only their rows; `markRead` on someone else's id returns `notifications.not_found`; mark-all clears only the caller; `updatePreferences` turns `in_app_enabled` off and a following `notify` does not insert; turning it on does not create backfill; muted membership skips `notify`; two list calls do not duplicate; unread count matches unread rows.

Browser: the empty inbox renders in Arabic with an accessible heading. Realtime browser coverage for two sessions belongs to browser-journeys.

No prior notification tests. Use the foundation harness and user-scoped clients.

## Out of Scope

- Web push subscriptions and service workers.
- Email notifications.
- The per-conversation mute control (conversation organization). This spec relies on `muted_until` already being honored by `notify`.
- Producing notification rows from messages, reactions, or invites. Those specs call `notify` when they exist. This spec may call `notify` inside its own tests.

## Further Notes

Implement this spec only. A quiet inbox on a fresh profile is correct. Do not invent sample notifications in the UI.
