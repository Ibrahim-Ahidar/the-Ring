# Pulse: platform foundation

**Status:** ready-for-agent

**Wave:** 0

**Blocked by:** None. This spec merges before any other Pulse spec starts.

**Owns:** the application shell, design tokens, i18n runtime, Supabase clients, the entire database schema and its row-level security, the shared predicates and ports, the slot loader, the test harness, and empty route frames.

**Must not edit:** nothing exists yet. Do not implement product screens beyond the frames and the landing page described here.

## Problem Statement

Pulse has no application. Later work needs a username-based chat that several agents can build at the same time. Without a single foundation, those agents will invent conflicting schemas, route maps, privacy rules, and test styles, and they will overwrite each other's files.

## Solution

Ship a bootable Pulse web app whose shared contracts are already complete. A member can open the shell in Arabic, English, or French, and the layout direction follows the locale. Authenticated tests can create a profile and call the shared operations. Product features plug in through their own modules and named slots. They do not need to change the schema, the privacy rules, or the shell to get started.

## User Stories

1. As a visitor, I want a public landing page that states Pulse's proposition, so that I understand I can find people by username and start a conversation.
2. As a visitor, I want links to log in and sign up, so that I can reach the account flows when those screens exist.
3. As a visitor, I want placeholder terms and privacy pages, so that the legal routes exist for a portfolio deployment.
4. As a visitor whose browser is new to Pulse, I want the interface in Arabic and laid out right to left, so that Arabic is the default experience.
5. As a visitor, I want English and French catalogs for the shell as well, so that switching locale later has shell copy in all three languages.
6. As a member, I want a desktop shell with navigation, a primary pane, and an optional side pane, so that later chat features have a stable frame.
7. As a member on a small screen, I want one pane at a time and a back affordance, so that the same shell works on a phone.
8. As a member, I want the shell to follow my theme preference of system, light, or dark, so that appearance is a token swap rather than a rewrite.
9. As a member who prefers reduced motion, I want decorative motion turned off, so that presence and transitions do not animate against my preference.
10. As a member, I want keyboard focus to be visible on shell controls, so that the frame is usable without a pointer.
11. As a signed-out visitor, I want protected app routes to send me to login, so that conversation data is not rendered anonymously.
12. As a developer running tests, I want to create a verified profile with a username, so that feature tests do not depend on the signup screens.
13. As a developer, I want a second test profile to be unable to read the first profile's private rows, so that row-level security is real in the harness.
14. As a member, I want usernames to match one normalization rule everywhere, so that `Ibrahim` and `ibrahim` cannot both exist.
15. As a member, I want reserved words rejected as usernames, so that names like `admin` and `pulse` are not claimable.
16. As a member, I want the privacy predicate to allow, request, or deny discover, message, invite, and presence, so that every feature applies the same safety decision.
17. As a member who has blocked someone, I want that block to deny interaction in both directions, so that later features cannot forget a block check.
18. As a member, I want a direct conversation between two people to be created once, so that retries do not open a duplicate chat.
19. As a sender, I want a repeated send with the same client id to return the original message, so that reconnects do not duplicate messages.
20. As a member, I want unread counts to come from my read cursor, so that no feature scans every message to render a badge.
21. As a recipient, I want an in-app notification row when `notify` is called, unless I muted that conversation or turned in-app notifications off, so that producers do not each invent notification storage.
22. As a member, I want send, search, conversation creation, reports, and uploads to hit a shared limiter, so that abuse limits exist before those screens do.
23. As a member, I want attachment size, type, and storage quota constants defined once, so that media work cannot pick a different cost policy.
24. As a member, I want realtime channel names fixed for a conversation and for my inbox, so that messaging and typing subscribe to the same places.
25. As a member, I want optimistic client state to stay separate from persisted rows, so that a message is not shown as sent until the server has stored it.
26. As a developer, I want the app to refuse to boot when a required environment variable is missing, so that misconfiguration fails immediately.
27. As a developer, I want the service-role key to be unavailable in browser code, so that privileged credentials stay on the server.
28. As a developer, I want an example environment file that lists names only, so that secrets are not committed.

## Implementation Decisions

- Product name is Pulse. The core proposition is: find people by username, start a conversation, and keep communication organized.
- Stack: Next.js (App Router, TypeScript) on Vercel; Supabase for Auth, Realtime, and Storage; PostgreSQL (Supabase's database) as the single system of record, with schema changes as versioned Supabase migrations. The browser client uses the anon key. The service-role key is read only on the server. Required variables are the public app URL, the public Supabase URL, the public anon key, and the server service-role key. Missing required variables abort startup. Commit an example env file with empty values.
- Authentication plumbing exists: a current-session lookup and a protected app area. Email verification state can be satisfied by the test fixture. The login and signup screens themselves belong to the identity spec; this spec only provides a login frame so the redirect target exists.
- Default locale is Arabic (`ar`, RTL). English (`en`, LTR) is the reference meaning of each key. French (`fr`, LTR) ships for shell copy. Use a catalog library with namespaces, interpolation, and plurals (`next-intl` or the same capability if the app router integration differs only in wiring). Format dates, times, numbers, and relative times with `Intl`. Do not add a date library. Do not concatenate translated fragments.
- Shell catalogs live with the shell. Each later feature ships its own `ar`, `en`, and `fr` catalogs inside its module. There is no shared catalog file for features to edit.
- Visual system: one accent; surfaces stack as background, panel, elevated card, modal; medium radius on controls; larger radius on bubbles; spacing only 8, 12, 16, and 24; motion 120–220ms and disabled under `prefers-reduced-motion`. Typography is Inter with an Arabic-capable fallback (Noto Naskh Arabic). One icon set (Lucide), and an icon-only control always has an accessible name. Dark and light palettes are token sets. Theme values are `system`, `light`, and `dark`.
- CSS uses logical properties (`margin-inline-start`, `padding-inline`, `inset-inline`). Mirror an icon only when it indicates direction. Do not mirror brand marks or media.
- Client UI is functional components only. Each feature keeps client state in a React context and a reducer. Presentational components are wrapped in `memo`. Derived values use `useMemo` and `useCallback`. Effects are idempotent and clean up. The server row is authoritative. Optimistic UI is allowed only for a pending send whose failure stays visible.
- Desktop shell: navigation, primary pane, optional right pane. Small screens: one pane plus back. Destructive actions are visually separated. The shell reads feature contributions from a filesystem discovery of feature modules. There is no hand-edited central registry. Contribution kinds are: `nav`, `overlay`, `composerTool`, `messageAction`, `bubbleExtra`, `messageRenderer`, `headerStatus`, `rightPanelTab`, `listItemMenu`, `requestRequired`.
- Route map and the single owner that may fill each frame:
  - `/`, `/legal/terms`, `/legal/privacy` — this spec
  - `/login`, `/signup` — identity
  - `/app` — this spec's shell
  - `/app/chats`, `/app/chats/new`, `/app/chats/[conversationId]` — direct messaging
  - `/app/groups`, `/app/groups/new`, `/app/groups/[groupId]` — groups
  - `/app/search` — search
  - `/app/contacts` — discovery
  - `/app/notifications` — notifications
  - `/username/[username]`, `/app/profile/[username]` — discovery
  - `/app/settings/account`, `/app/settings/security` — identity
  - `/app/settings/privacy` — safety
  - `/app/settings/notifications` — notifications
  - `/app/settings/appearance`, `/app/settings/language` — locale and appearance
  - `/app/media/[conversationId]` — media
- This spec may create empty frames for those routes so navigation does not 404. Only the owner spec replaces the frame body.
- Dependencies this spec installs, so later specs do not edit the package manifest: Next.js, React, Supabase browser and server clients, the i18n library, Zod, Vitest, Playwright, the icon set, TypeScript, and the linter. Later specs must not add packages.
- Test seam for the whole product is the application service: user-intent functions that take an authenticated context and return a `Result`. This spec provides the harness: reset the database, `createUser` (verified auth user plus profile), and a user-scoped client so queries pass through row-level security. Browser harness boots the shell for UI specs. Do not assert SQL text or component internals.

Result shape, shared by every service:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } };
```

Error codes are stable strings namespaced by feature (`identity.username_taken`). User-facing sentences come from catalogs, not from the service.

Interaction predicate this spec implements and tests. Later specs call it and do not replace it:

```ts
type InteractionAction = "discover" | "message" | "invite" | "presence";
type InteractionDecision = "allow" | "request" | "deny";

decideInteraction(
  actorId: string,
  targetId: string,
  action: InteractionAction,
): Promise<Result<InteractionDecision>>;
```

Predicate rules:

- The actor and the target being the same person yields `allow`.
- A block in either direction yields `deny` for every action.
- `discover`: `deny` when `discoverable` is false; `deny` when `profile_visibility` is `private`; `allow` when it is `public` and discoverable; `allow` when it is `contacts` and either person has favorited the other; otherwise `deny`.
- `message`: if a direct conversation already exists between them and there is no pending message request, `allow` unless blocked. Otherwise `who_can_message` maps `everyone` → `allow`, `requests` → `request`, `nobody` → `deny`.
- `invite`: `who_can_add_to_groups` maps `everyone` → `allow`, `contacts` → `allow` only when either person has favorited the other, `nobody` → `deny`.
- `presence`: `deny` when the target's `show_online` is false. Last-seen visibility is a separate boolean, `show_last_seen`, checked by readers of `last_seen_at`. Block still denies presence.
- Hidden people and missing people look the same to search: an empty result, not a distinct forbidden error.

Username normalizer this spec owns:

- Display form keeps the typed casing. `normalized_username` is lowercase.
- Length 3–20 after normalization. Must start with a letter. Remaining characters are letters, digits, or underscore.
- Reserved normalized names: `admin`, `support`, `pulse`, `help`, `system`, `everyone`, `here`, `null`, `undefined`.
- Uniqueness is on `normalized_username`.

Other ports this spec implements:

- `notify({ recipientId, type, actorId, entityId, conversationId })` inserts an in-app notification unless the recipient turned in-app notifications off, or `conversationId` is set and that membership is muted (`muted_until` in the future). It does not throw when the recipient is missing; it returns `notifications.recipient_missing`.
- `limit({ userId, action })` uses a fixed window. Limits: send message 30 per minute, search users 20 per minute, create conversation 10 per minute, submit report 5 per hour, start upload 20 per hour. Over the limit returns `platform.rate_limited`.
- Media constants: images jpeg/png/webp/gif up to 8 MB; documents pdf and plain text up to 20 MB; audio webm/ogg/mp4/mpeg up to 8 MB and 180 seconds; per-user stored bytes capped at 100 MB.

Realtime names:

- `conversation:{conversationId}` for message row changes, typing broadcast, and presence of people with that conversation open.
- `inbox:{userId}` for membership and conversation summary changes, and for notification rows.

Typing and presence events are broadcast or presence state. They are not message rows. Heartbeats are not inserted.

Schema this spec creates in full. Later specs use these tables and do not edit the migration that created them. A later spec may add a new migration only for an index that query evidence shows is missing.

- `profiles`: `id` (auth user id), `username`, `normalized_username` unique, `display_name`, `avatar_url`, `bio`, `locale` default `ar`, `timezone` default `UTC`, `theme` default `system`, `username_changed_at`, `discoverable` default true, `show_last_seen` default true, `show_online` default true, `send_read_receipts` default true, `who_can_message` default `everyone` (`everyone` | `requests` | `nobody`), `who_can_add_to_groups` default `everyone` (`everyone` | `contacts` | `nobody`), `profile_visibility` default `public` (`public` | `contacts` | `private`), `last_seen_at`, `created_at`.
- `conversations`: `id`, `type` (`direct` | `group`), `title`, `description`, `avatar_url`, `created_by`, `created_at`, `updated_at`, `last_message_at`, `last_message_id`, `direct_pair_key` unique nullable. The direct key is the two user ids sorted and joined, and it is null for groups.
- `conversation_members`: `conversation_id`, `user_id`, unique pair, `role` (`owner` | `admin` | `member`), `joined_at`, `muted_until`, `last_read_message_id`, `last_read_at`, `archived_at`, `pinned_at`, `left_at`, `messaging_restricted` default false.
- `messages`: `id`, `conversation_id`, `sender_id`, `client_id`, unique (`sender_id`, `client_id`), `type` (`text` | `image` | `file` | `audio` | `system`), `body`, `reply_to_id`, `created_at`, `edited_at`, `deleted_at`, `deletion_scope` (`none` | `everyone`), `pinned_at`, `forwarded` boolean default false, `metadata` jsonb.
- `message_hides`: `message_id`, `user_id`, `hidden_at`, unique pair.
- `message_reactions`: `message_id`, `user_id`, `emoji`, `created_at`, unique (`message_id`, `user_id`, `emoji`).
- `attachments`: `id`, `message_id`, `storage_path`, `mime_type`, `size_bytes`, `file_name`, `width`, `height`, `duration_ms`, `waveform` jsonb, `created_at`.
- `blocks`: `blocker_id`, `blocked_id`, `created_at`, unique pair.
- `reports`: `id`, `reporter_id`, `target_user_id`, `target_message_id`, `category`, `details`, `status` (`open` | `reviewed` | `dismissed`), `created_at`.
- `notifications`: `id`, `recipient_id`, `type`, `actor_id`, `entity_id`, `conversation_id`, `read_at`, `created_at`.
- `notification_preferences`: `user_id` primary key, `in_app_enabled` default true, `push_enabled` default false, `mentions_only` default false.
- `devices`: `id`, `user_id`, `device_label`, `last_seen_at`, `revoked_at`, `created_at`.
- `message_requests`: `id`, `from_user_id`, `to_user_id`, `conversation_id`, `status` (`pending` | `accepted` | `declined`), `created_at`. Only one `pending` row per ordered pair.
- `favorites`: `user_id`, `favorite_user_id`, `created_at`, unique pair.
- `recent_searches`: `id`, `user_id`, `normalized_username`, `created_at`.
- `chat_folders`: `id`, `user_id`, `name`, `position`, `created_at`.
- `conversation_folder_items`: `folder_id`, `conversation_id`, unique pair.
- `invite_links`: `id`, `conversation_id`, `code` unique, `created_by`, `expires_at`, `revoked_at`, `max_uses`, `use_count`.
- `storage_usage`: `user_id` primary key, `bytes_used` default 0.

Indexes: `profiles(normalized_username)` unique; `conversation_members(user_id, conversation_id)` unique; `messages(conversation_id, created_at desc)`; `messages(sender_id, created_at desc)`; `notifications(recipient_id, read_at, created_at desc)`; `blocks(blocker_id, blocked_id)` unique.

Row-level security is enabled on every table, default deny. Policies:

- A profile row is readable by its owner always. Another authenticated member can read it only when `decideInteraction` would not deny `discover`, except that block denies discovery. The owner updates their own profile through the identity and safety services, not by granting the browser unrestricted column updates. Username, normalized username, and `username_changed_at` are not client-writable.
- Conversation, membership, message, hide, reaction, and attachment rows are readable by current members (`left_at` is null). Inserts and updates go through the owning service's checks; the browser role cannot update another member's read cursor or another sender's message.
- Blocks are readable and writable only by the blocker, and only through the safety service.
- Reports are readable by the reporter. A group owner or admin can read reports whose target message belongs to a group they administer.
- Notifications and notification preferences are readable by the recipient only.
- Message requests are readable by the sender and the recipient.
- Favorites, recent searches, folders, and folder items are readable by the owning user.
- Invite links are readable by current members of the conversation. Joining by code is a server operation.
- Storage objects are private. Paths are server-generated. The browser never chooses the object key.
- Deleted-for-everyone message bodies are not returned to clients. The row remains with `deleted_at` set so the timeline can show a tombstone. Delete-for-me is a `message_hides` row and hides the message only for that user.
- Service-role access is for server operations and migrations. Tests use user-scoped clients.

Seed the storage buckets as private: one for attachments. Do not make the bucket public.

`createUser` inserts an auth user with a confirmed email and a profile row that already satisfies the username rules. Feature tests use it instead of the signup UI.

Message list pagination contract: cursor on `(created_at, id)`, page size 50, newest page first. Conversation list page size 30, ordered by `pinned_at` nulls last, then `last_message_at` descending, excluding rows with `archived_at` set unless the caller passes `includeArchived`. Optional `folderId` limits the list to `conversation_folder_items`.

Read-cursor contract: a cursor moves only forward. Unread count is messages in the conversation with `created_at` after the cursor message, not sent by the member, not hidden for them, and not `deletion_scope = everyone`.

Direct-open contract: `openDirect` is implemented by the messaging spec, but the unique `direct_pair_key` is created here so two parallel creators cannot insert two direct conversations.

## Testing Decisions

A good test calls a public operation with a user-scoped client and asserts the returned `Result` plus what a second user can or cannot read. It does not inspect component state, private helpers, or SQL strings.

This spec tests:

- Username normalization, reserved words, and uniqueness.
- `decideInteraction` for discover, message, invite, and presence, including blocks, visibility, favorites, and an existing direct conversation.
- `notify` inserting a row, skipping a muted conversation, and skipping a recipient who disabled in-app notifications.
- `limit` allowing traffic inside the window and returning `platform.rate_limited` above it.
- Idempotency unique constraint: two inserts with the same sender and client id cannot both exist.
- Row-level security: a non-member cannot read a conversation's messages; a member can; a blocker sees their block; the blocked person does not.
- The shell browser smoke: an authenticated fixture session renders the shell in Arabic with `dir="rtl"`; an anonymous visit to `/app` redirects to `/login`; setting the locale to English on the profile flips the shell to `dir="ltr"`.

There is no prior test suite. This harness is the pattern later specs copy: one test file per feature, service functions, user-scoped clients, and `createUser`.

## Out of Scope

- Signup, login forms, profile editing, session revoke, and account deletion (identity).
- Privacy settings UI, block UI, and report UI (safety). The predicate and tables exist here.
- Language switcher, theme settings UI, command palette, and shortcut help (locale and appearance). Tokens and locale persistence columns exist here.
- Notification inbox UI (notifications). The `notify` port exists here.
- Username search UI, favorites UI, and public profile pages (discovery).
- Sending and rendering messages (direct messaging).
- Typing indicators and presence dots (typing and presence).
- CI workflows and error monitoring (CI spec).
- Web push delivery. `push_enabled` is stored only.
- Server-side link unfurling, virus scanning, voice or video calls, and end-to-end encryption.
- Demo seed accounts and the portfolio case-study page.

## Further Notes

Parallel agents after this spec merge each take one wave-1 spec. They add a feature module that exports contributions, fill only the routes they own, and add tests beside their service. They do not edit this spec's migration, the predicate, `limit`, the package manifest, or the shell layout. The notifications spec may add an optional `mention` argument to `notify`. No other spec edits that port.

Vocabulary for every spec: Profile, Username, Conversation, Member, Message, client id, read cursor, Presence, Typing, Message request, Block, Report, Notification, Attachment, Reaction, Chat folder, Invite link, Locale, Safety decision (`allow`, `request`, or `deny`).

Landing copy states the proposition in all three locales. It does not claim end-to-end encryption or production moderation staff.
