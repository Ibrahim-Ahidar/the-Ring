# Pulse: privacy, blocks, and reports

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/app/settings/privacy` and the safety application service (block, unblock, report, update privacy settings).

**Must not edit:** `decideInteraction` except to fix a defect proven by a failing test that quotes a foundation rule. Do not edit the messaging, discovery, or shell modules. Do not edit the foundation migration or the package manifest.

## Problem Statement

A member cannot see or change who can find them, message them, or add them to groups, and they cannot block or report another person. The foundation already decides interactions from those fields, but nothing writes them and nothing explains them.

## Solution

Privacy settings become a clear screen for discoverability, profile visibility, last seen, online status, read receipts, who can message, and who can add the member to groups. Blocking is immediate and mutual in effect. Reporting files a categorized report the reporter can see, with group admins able to see reports about messages in groups they administer. The existing predicate picks up the new rows without a second implementation.

## User Stories

1. As a member, I want to see my current privacy settings in plain language, so that I know who can find and message me.
2. As a member, I want to turn username discoverability off, so that exact-username search hides me.
3. As a member, I want profile visibility of public, contacts, or private, so that I control who can open my profile.
4. As a member, I want to hide my online status, so that presence is not shown to other people.
5. As a member, I want to hide last seen, so that the timestamp is not shown.
6. As a member, I want to turn off read receipts, so that others do not see when I have read a message.
7. As a member, I want who-can-message set to everyone, message requests, or nobody, so that strangers cannot always open a chat.
8. As a member, I want who-can-add-me-to-groups set to everyone, contacts, or nobody, so that group invites follow my choice.
9. As a member, I want each privacy change saved on its own and confirmed, so that a failed save does not pretend it worked.
10. As a member, I want to block another member, so that they cannot discover me, message me, or invite me.
11. As a member, I want a block to also stop me from starting those interactions with them, so that the relationship is fully cut for new actions.
12. As a member, I want to see the people I have blocked, so that I can review the list.
13. As a member, I want to unblock someone, so that the predicate allows interactions again according to my privacy settings.
14. As a member, I want blocking someone I have not blocked to be idempotent, so that a double tap does not create two rows or an error.
15. As a member, I want to report a person or a message with a category and optional details, so that abuse can be recorded.
16. As a member, I want report categories for spam, harassment, impersonation, and other, so that the reason is structured.
17. As a member, I want my own reports listed with their status, so that I can see they were received.
18. As a group admin, I want to read reports that target messages in a group I administer, so that moderation has a queue. Acting on them beyond marking reviewed is the groups spec's member tools; this spec stores status.
19. As a member, I want report details kept out of normal chat, so that a report is not a message.
20. As a member, I want a sixth report inside an hour refused, so that the foundation report limit applies.
21. As a member, I want privacy, block, and report screens in Arabic, English, and French, including RTL layout on this screen, so that safety copy is localized.
22. As a member using the keyboard, I want the block confirmation and report dialog to trap and restore focus, so that I cannot tab into the page behind them.
23. As a member, I want a failed save to keep my previous settings visible, so that an error does not blank the form.

## Implementation Decisions

- Safety service operations: `getPrivacy`, `updatePrivacy`, `blockUser`, `unblockUser`, `listBlocks`, `reportUser`, `reportMessage`, `listMyReports`, `listGroupReports`, `markReportReviewed`.
- `updatePrivacy` writes only the privacy columns on the caller's profile: `discoverable`, `profile_visibility`, `show_last_seen`, `show_online`, `send_read_receipts`, `who_can_message`, `who_can_add_to_groups`. Unknown enum values return `safety.invalid_setting`.
- `blockUser` inserts the pair. A repeat insert returns the existing row with `ok: true`. Blocking oneself returns `safety.cannot_block_self`. The blocked id must be a profile or the result is `safety.not_found`.
- `unblockUser` removes the caller's block row. Missing row returns `safety.not_found`.
- Reports: category is `spam`, `harassment`, `impersonation`, or `other`. Details are optional text capped at 1000 characters. At least one of `target_user_id` or `target_message_id` is required. The reporter must be allowed to know the target exists: for a message, they must be a member of that conversation; otherwise `safety.not_found`. Status starts at `open`.
- `markReportReviewed` is allowed for the reporter on their own report and for a group owner or admin when the report's message is in their group. It sets `reviewed`. `dismissed` is not exposed in this spec.
- Do not duplicate `decideInteraction`. Tests in this spec set columns and blocks, then call the foundation predicate and assert `allow`, `request`, or `deny`.
- The privacy screen groups controls by concern: discovery, presence, messaging, groups. Destructive block actions are visually separated and confirmed.
- Client state is a safety context and reducer. Presentational rows are memoized.
- Catalogs for this feature exist in Arabic, English, and French inside the safety module. Setting labels are full sentences, not stitched fragments.
- Empty state: no blocked people, no reports. Loading and error states exist for the lists.

## Testing Decisions

Service tests with two and three users from `createUser`. Assert codes and visibility under user-scoped clients.

Cover: each privacy column round-trips; a second user cannot update the first user's privacy; block makes `decideInteraction` return `deny` both ways for discover and message; unblock restores the decision implied by the privacy columns; duplicate block stays a single row; report on a conversation the reporter is not in returns `safety.not_found`; the reporter can list their report; a non-admin stranger cannot list it; the sixth report in an hour returns `platform.rate_limited`; group admin can list a report tied to their group's message.

Browser: the privacy page renders its controls in Arabic with `dir="rtl"`. Full product journeys stay in the browser-journeys spec.

No prior safety tests. Use the foundation harness.

## Out of Scope

- Message request inbox UI (message-requests spec). This spec only sets `who_can_message` to `requests`.
- Removing a group member or deleting a group message (groups).
- Automated spam classification and a staff moderation console.
- Hiding historical messages when a block is created. New interactions stop. Existing rows remain readable by current members until a later product decision.
- Web push and email alerts when a report arrives.

## Further Notes

Implement this spec only. Discovery and messaging already call `decideInteraction` once those specs exist; do not edit their modules to "wire in" safety. Writing the columns is enough.
