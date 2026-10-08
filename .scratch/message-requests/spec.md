# Pulse: message requests

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** the message-request service, the requests section of the chats experience, and the `requestRequired` contribution.

**Must not edit:** `openDirect`'s allow path, `decideInteraction`, or the foundation migration. `openDirect` already returns `messaging.request_required` and creates no conversation when the safety decision is `request`. This spec handles that result.

## Problem Statement

When a member restricts unsolicited messages, the spine correctly refuses to open a full conversation, but the sender has no way to ask, and the recipient has no way to accept or decline. The privacy setting `requests` would otherwise be a dead end.

## Solution

A sender whose message decision is `request` can send one message request with an optional note. The recipient sees it in a requests area, accepts it into a direct conversation, or declines it. A pending request is not a normal chat. Accept creates the direct conversation once. Decline and blocks keep the conversation from opening.

## User Stories

1. As a member who is not allowed to message someone directly, I want the profile and new-chat flow to offer a request, so that I can still introduce myself.
2. As a sender, I want to include a short note with the request, so that the recipient knows why I am writing.
3. As a sender, I want a second pending request to the same person to be refused or updated as a single pending row, so that I cannot stack requests.
4. As a sender, I want a denied decision (block or nobody) to refuse the request, so that requests do not bypass a block.
5. As a sender, I want an allow decision to tell me to open a normal chat instead, so that I do not create a request when I can message.
6. As a recipient, I want pending requests listed apart from my normal chats, so that strangers do not land in the main inbox as conversations.
7. As a recipient, I want to read the note and the sender's display name and username, so that I can decide.
8. As a recipient, I want to accept a request, so that a direct conversation opens and the note becomes the first message.
9. As a recipient, I want accept to create only one conversation even if I tap twice, so that acceptance is idempotent.
10. As a recipient, I want to decline a request, so that no conversation is created.
11. As a sender, I want to see that my request is pending, accepted, or declined, so that I am not left guessing.
12. As a recipient, I want a notification of type `message_request.created`, so that the inbox shows the request.
13. As a member, I want an empty requests state, so that the section is understandable when nobody is waiting.
14. As a member, I want request copy in Arabic, English, and French, so that the ask and the decision match my locale.
15. As a member, I want accept and decline confirmed accessibly, so that a destructive decline is explicit and keyboard usable.
16. As a member, I want a request from someone I then block to become unusable, so that a later accept fails if a block now exists.
17. As a member, I want the note capped, so that a request cannot carry a huge body.

## Implementation Decisions

- Service operations: `createRequest({ username, note })`, `listIncoming`, `listOutgoing`, `acceptRequest`, `declineRequest`.
- `createRequest` loads the profile, calls `decideInteraction` for `message`. `deny` returns `message_requests.not_allowed`. `allow` returns `message_requests.not_required`. `request` inserts a pending row or returns the existing pending row (idempotent) and does not create a conversation. Note is optional, trimmed, max 300 characters. Empty note is allowed.
- A declined or accepted row does not block a future request after decline: the sender may create a new pending request after decline. After accept, `decideInteraction` should return `allow` because a direct conversation exists, so a new request returns `message_requests.not_required`.
- `acceptRequest` is recipient-only. Re-check `decideInteraction`. If it is now `deny`, return `message_requests.not_allowed` and do not create a conversation. If a direct conversation already exists, mark the request accepted and return that conversation. Otherwise call the same direct-pair creation rules as `openDirect` (unique `direct_pair_key`, both members) and, when the note is non-empty, call `sendText` as the sender of the request so the note is the first message. Mark the request accepted and store `conversation_id`.
- `declineRequest` is recipient-only and sets `declined`. It does not create a conversation. Idempotent if already declined.
- The sender cannot accept or decline. A stranger cannot read the request (`message_requests.not_found`).
- Notify the recipient on create with type `message_request.created`. Notify the sender on accept with `message_request.accepted`. Do not notify on decline.
- UI: the `requestRequired` contribution shows the note field and send action. A requests section is available from `/app/chats?requests=1` or a control on the chats page. Adding that control is allowed as a `listItemMenu` or a small mount on the chats page that does not change list sorting. Incoming and outgoing are separate lists.
- Client state is a message-requests context and reducer. Presentational rows are memoized.
- Catalogs in Arabic, English, and French.

## Testing Decisions

Service tests: privacy `who_can_message = requests` yields a pending row and zero conversations; block yields not allowed; everyone yields not required; duplicate create is one pending row; recipient accept creates one direct conversation and a text message when a note was present; second accept returns the same conversation; decline creates no conversation; the sender cannot accept; a third user cannot list the request; accept after a new block fails; notification row exists for the recipient.

Set privacy columns directly in the fixture. Do not depend on the safety settings UI.

Browser: the request-required state exposes an accessible note field in Arabic when `openDirect` returns `messaging.request_required`. Full two-account flow is the browser-journeys spec.

No prior request tests. Use `createUser`, `decideInteraction` via column setup, and the messaging service for the accept path's message.

## Out of Scope

- Group invites (groups spec).
- Message requests for people set to nobody. Those stay denied.
- Editing the note after send.
- A separate spam classifier.

## Further Notes

Implement this spec only. Do not change `openDirect` to create conversations on `request`. The error code is the seam between the spine and this feature.
