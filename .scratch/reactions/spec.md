# Pulse: reactions

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** the reactions service and the `bubbleExtra` plus `messageAction` contributions that add and display emoji reactions.

**Must not edit:** message send, the timeline structure, the foundation migration, or another feature's module. Register contributions into the slots the messaging page already renders.

## Problem Statement

Members cannot react to a message. A reaction is a small piece of conversation state that must stay consistent for everyone in the thread without becoming a new message.

## Solution

A member adds or removes a single emoji on a message they can see. The reaction row is unique per member, message, and emoji. Both people see the counts update from the conversation's realtime row changes. Reactions are not messages and do not bump the unread preview by themselves.

## User Stories

1. As a member, I want to react to a message with an emoji, so that I can respond without a new message.
2. As a member, I want a short set of emoji choices, so that the picker stays simple.
3. As a member, I want my reaction to appear on the message immediately and then confirm from the server, so that the UI is responsive and still honest.
4. As a member, I want a failed reaction to roll back, so that I do not see an emoji the server refused.
5. As a member, I want tapping my existing reaction to remove it, so that I can undo.
6. As a member, I want two different emoji from me on the same message, so that I am not limited to one reaction type.
7. As a member, I want a repeated add of the same emoji to stay one row, so that retries are safe.
8. As a member, I want to see a count per emoji and whether I reacted, so that the summary is readable.
9. As a member, I want another member's reaction to show up without refresh, so that the thread stays live.
10. As a member, I want reactions on a message I cannot see to fail, so that outsiders cannot react.
11. As a member, I want reactions on a deleted-for-everyone message refused, so that a tombstone cannot collect new reactions.
12. As a member, I want a hidden (delete for me) message to be unreactable for me, so that I do not interact with a message I removed.
13. As a member, I want an unsupported emoji rejected, so that the allowlist is the whole set.
14. As a member, I want the picker and the counts labeled for assistive tech, so that emoji are not the only name.
15. As a member, I want reaction chrome in Arabic, English, and French, so that the labels match my locale.
16. As a member, I want adding a reaction not to create an unread message preview by itself, so that the conversation list stays about messages. A notification of type `reaction.created` is still sent to the other members except the actor.
17. As a member, I want the picker usable from the keyboard, so that I can add a reaction without a pointer.

## Implementation Decisions

- Allowlist: 👍 ❤️ 😂 😮 😢 🙏. Store the emoji character. Anything else returns `reactions.invalid_emoji`.
- Service operations: `addReaction({ messageId, emoji })`, `removeReaction({ messageId, emoji })`, `listReactions({ conversationId, messageIds })`.
- Add requires the caller to be a current member, the message not deleted for everyone, and the message not hidden for the caller. Unique `(message_id, user_id, emoji)` makes a repeat add return the existing row with `ok: true`.
- Remove deletes the caller's row. Missing row returns `reactions.not_found`.
- Do not update `last_message_id` or `last_message_at` when a reaction changes.
- Call `notify` for other current members with type `reaction.created` on add only. Do not notify on remove.
- The bubble extra contribution renders counts for the message id it is given. The message action contribution opens the picker.
- Optimistic add lives in the reactions reducer and reconciles by message id, user id, and emoji. Rollback on error.
- Realtime: the existing conversation channel receives reaction row changes if the foundation realtime publication includes the table. This spec ensures reactions are part of the realtime publication for `message_reactions` if that publication was limited to messages. That is an allowed new migration only for publication, not for table shape.
- Catalogs in the reactions module for Arabic, English, and French. Each emoji has an accessible name key.
- Presentational count chips are memoized.

## Testing Decisions

Service tests: member adds a reaction and the other member's list includes it; non-member gets `messaging.not_member` or `reactions.not_allowed`; duplicate add is one row; remove then list is empty; invalid emoji fails; deleted-for-everyone fails; a hide for the actor blocks the actor and still allows the other member; conversation `last_message_at` is unchanged after a reaction; a notification row exists for the other member.

Browser: the reaction button has an accessible name. Two-session updates belong to browser-journeys.

No prior reaction tests. Set up a conversation with the messaging service.

## Out of Scope

- Custom emoji and skin-tone variants beyond the six.
- Reactions on the conversation list.
- Editing the message body.

## Further Notes

Implement this spec only. Do not rebuild the message bubble. Contribute to the bubble extra slot.
