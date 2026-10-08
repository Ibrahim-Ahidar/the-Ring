# Pulse: direct messaging spine

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/app/chats`, `/app/chats/new`, `/app/chats/[conversationId]`, and the messaging application service for direct conversations, text sends, history, read cursors, and reconnect reconciliation.

**Must not edit:** the foundation migration, `decideInteraction`, `notify`, `limit`, typing or presence modules, reaction tables' writers, the package manifest, or the shell layout. Render foundation slots so later specs can attach without editing this page.

## Problem Statement

Two members cannot open a direct conversation, send a text message that persists, or see it arrive in realtime. There is no conversation list, no unread state, and no honest handling of a failed or retried send.

## Solution

A member starts or reopens a direct conversation with someone the safety decision allows, sends text that is stored once even if the client retries, and sees the thread update from realtime row changes. The list shows the latest message and an unread count from the read cursor. If the network fails, the message stays visible as pending or failed and retries without duplication. Reply, edit, reactions, attachments, and groups are slots and fields this spine displays when the data is present; their commands belong to later specs.

## User Stories

1. As a member, I want a chats destination as the home of the app, so that conversations are the primary place I land.
2. As a member, I want to start a direct conversation by username, so that I can message someone I found.
3. As a member, I want starting a chat with the same person twice to open the same conversation, so that I do not split history.
4. As a member, I want a denied safety decision to refuse the conversation, so that blocks and "nobody can message me" are respected.
5. As a member, I want a `request` safety decision to refuse a full conversation and return a specific error, so that the message-request spec can fill the request slot without this spec building that inbox.
6. As a member, I want an empty chat list explained, so that a new account knows to start a conversation.
7. As a member, I want the list to show the other person's name, avatar, last message preview, and time, so that I can scan my chats.
8. As a member, I want the list ordered by pinned first and then latest activity, so that organization preferences apply when those columns are set.
9. As a member, I want archived conversations hidden unless I ask to see them, so that archive works once the organization spec sets the column.
10. As a member, I want a folder query to limit the list to that folder, so that the organization spec can filter without rewriting the list.
11. As a member, I want an unread count from my read cursor, so that the badge is correct without marking every message.
12. As a member, I want opening a conversation to advance my read cursor to the latest message I can see, so that the badge clears.
13. As a member, I want my own messages not to count as unread, so that sending does not badge the chat for me.
14. As a sender, I want to type and send a text message, so that I can talk.
15. As a sender, I want the message to appear immediately as pending, so that the UI feels instant.
16. As a sender, I want the message to become sent only after the server stores it, so that a pending bubble is not a lie.
17. As a sender, I want a failed send to stay visible with retry, so that I can recover.
18. As a sender, I want retry with the same client id to result in one row, so that a double retry does not duplicate the message.
19. As a recipient, I want the new message to appear without refresh, so that the conversation is realtime.
20. As a member, I want history paginated, so that a long thread does not load every row at once.
21. As a member, I want to load older messages, so that I can scroll back.
22. As a member, I want messages from someone who is not a member of the conversation to be rejected, so that outsiders cannot write.
23. As a member, I want a restricted member (`messaging_restricted`) or a member who left to be unable to send, so that group moderation flags work when groups set them.
24. As a member, I want an empty thread explained, so that a new chat invites the first message.
25. As a member, I want a deleted-for-everyone message shown as a tombstone without the body, so that later delete actions have a display.
26. As a member, I want a message I hid (delete for me) omitted from my timeline and still visible to the other person, so that hides are per user.
27. As a member, I want an edited marker when `edited_at` is set, so that later edits are visible.
28. As a member, I want a reply quote slot when `reply_to_id` is set, so that later replies render.
29. As a member, I want message action, bubble extra, composer tool, header status, right panel, list menu, and request-required slots rendered, so that later specs contribute without editing this page.
30. As a member, I want text rendered as text, so that message bodies cannot inject HTML.
31. As a member, I want a draft kept on this device for the conversation, so that leaving the thread does not throw away unsent text.
32. As a member, I want drafts not stored on the server, so that unsent text stays on the device.
33. As a member, I want a reconnect to refetch the latest page and merge by message id and client id, so that a dropped socket does not lose or duplicate messages.
34. As a member, I want a visible reconnecting state, so that I know realtime is down while I can still type.
35. As a member, I want read state on my sent messages when the other member's cursor has reached them and they have read receipts on, so that ticks reflect the cursor. When their receipts are off, I want the message to stay at sent.
36. As a recipient, I want a new direct message to call `notify` for the other member, so that the inbox can show it.
37. As a member, I want sending over the rate limit to fail the message visibly, so that the limiter is enforced.
38. As a member, I want the composer and list in Arabic, English, and French, so that the chat chrome is localized.
39. As a member on a small screen, I want the list and the thread to be separate panes with back, so that the phone layout matches the shell.
40. As a member using the keyboard, I want to reach the composer, send, and return to the list, so that the spine is usable without a pointer.

## Implementation Decisions

- Service operations: `openDirect({ username })`, `listConversations({ cursor, includeArchived, folderId })`, `listMessages({ conversationId, cursor })`, `sendText({ conversationId, clientId, body, replyToId })`, `markRead({ conversationId, messageId })`, `getConversation({ conversationId })`.
- `openDirect` resolves the username through the discovery visibility rules by calling `decideInteraction` for `message` after finding the profile. `deny` returns `messaging.not_allowed` and creates nothing. `request` returns `messaging.request_required` and creates nothing. `allow` inserts a direct conversation with both members at role `member`, using `direct_pair_key`, or returns the existing one. Race on the unique key returns the existing row. Call `limit` for create conversation.
- `sendText` requires membership, `left_at` null, and `messaging_restricted` false. Body is required, trimmed, and capped at 4000 characters. Type is `text`. Optional `replyToId` must be a message in the same conversation or the call returns `messaging.reply_not_found`; this spine accepts the field and stores it, and the reply command UI is the message-actions spec. Same sender and `clientId` returns the existing message. On success, update the conversation's `last_message_id` and `last_message_at` in the same operation. Call `limit` for send. Call `notify` for the other members with type `message.created`.
- `markRead` moves `last_read_message_id` only forward compared by `(created_at, id)`. A backward id returns the current cursor with `ok: true` and does not move it. The caller must be a member.
- Unread count uses the foundation formula. List previews use the latest non-hidden message body, or a tombstone label key when the latest is deleted for everyone.
- Timeline query excludes `message_hides` for the caller and returns tombstones without `body` when `deletion_scope` is `everyone`. Page size 50, cursor pagination as in the foundation contract.
- List page size 30. Order: `pinned_at` descending nulls last, then `last_message_at` descending. Exclude `archived_at` unless `includeArchived`. `folderId` joins `conversation_folder_items` and must belong to the caller or return `messaging.not_found`.
- Realtime: subscribe to `conversation:{id}` postgres changes for messages and to `inbox:{userId}` for conversation summary changes. Reconnect fetches the newest message page and the conversation list and merges by id. Pending client messages match on `clientId`.
- Delivery display: `pending` (local, not yet ok), `failed` (local error, retry reuses `clientId`), `sent` (row exists), `read` (the other direct member's cursor is at or beyond this message and their `send_read_receipts` is true). There is no separate delivered tick.
- Drafts live in the messaging reducer keyed by conversation id, persisted in `localStorage` on this device only. They are not a table.
- The composer dispatches a window event `pulse:composer` with detail `{ conversationId, activity: "input" | "idle" }` so typing can listen without either module importing the other. Input fires when the draft becomes non-empty and while it changes, at most once every 3 seconds. Idle fires when the draft is cleared or after 3 seconds without changes.
- Render message body as text nodes. Do not interpret HTML.
- Slots rendered even when no contribution is registered: `messageAction`, `bubbleExtra`, `composerTool`, `headerStatus`, `rightPanelTab`, `listItemMenu`, `requestRequired`, and `messageRenderer` by type. The text renderer is this spec's default for type `text`. Unknown types fall back to a generic unavailable label so a media message does not crash the thread before the media spec exists.
- The new-chat page reads `username` from the query string and calls `openDirect`. On `messaging.request_required`, render the `requestRequired` slot with the target username.
- Client state is a messaging context and reducer: conversations, messages by conversation, pending sends, drafts, connection status. Presentational bubbles and list rows are memoized. Group consecutive messages from the same sender within five minutes for display, without changing stored rows.
- An unread separator label is shown above the first unread message when the member opens a thread that had unread messages.
- Catalogs in Arabic, English, and French in the messaging module, including plural unread counts and the reconnecting label.
- Show a subtle reconnecting indicator. Do not block the composer while reconnecting. Sends during disconnect stay pending and flush in order on reconnect, each with its original client id.

## Testing Decisions

Service tests with two user-scoped clients. Cover: openDirect creates one conversation and a second call returns it; deny and request create zero conversations; a non-member send returns `messaging.not_member`; restricted member cannot send; send then list shows the body to both members; same client id returns one row; markRead moves forward and ignores a backward id; unread count ignores the sender's own messages and messages at or before the cursor; hide row removes the message for one user only; deleted-for-everyone omits the body for both; folder filter and archive filter; rate limit on send; notify called for the recipient (assert a notification row exists when their preferences allow it); a third user cannot list the conversation.

Browser: one authenticated member sees the empty chat state in Arabic. Two-session realtime and reconnect journeys belong to browser-journeys.

No prior messaging tests. Use the foundation harness. Assert on `Result` values and rows visible to each user, not on reducer internals.

## Out of Scope

- Typing and presence UI (typing-presence), except rendering the header slot.
- Reply, edit, delete, forward, pin, and copy commands (message-actions), except storing `replyToId` and displaying edited, tombstone, and reply fields.
- Reactions, attachments, voice notes.
- Group creation and roles (groups). This spine already lists any conversation the member belongs to, including a group row if one exists.
- Folders, mute, pin, and archive controls (organization), except honoring the columns in the list query.
- Message request creation UI (message-requests).
- Virtualized list tuning beyond pagination. Add windowing only if a page of 50 is insufficient to scroll smoothly; do not load the full history.

## Further Notes

Implement this spec only. Later wave-2 specs will register contributions. Leave the slots in place and do not build their menus. If the foundation is not merged, stop.
