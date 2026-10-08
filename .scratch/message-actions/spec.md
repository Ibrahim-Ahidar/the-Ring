# Pulse: message actions

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** the message-actions service and the `messageAction` contributions for reply, edit, delete for me, delete for everyone, forward, pin, copy, and link display.

**Must not edit:** `sendText`, the conversation list query, the foundation migration, or another feature's module. Store replies through the existing `replyToId` field on `sendText`. Display of edited markers and tombstones already belongs to the messaging timeline; this spec performs the transitions and registers the menu.

## Problem Statement

A member can send a plain text message, but cannot reply, correct it, remove it, forward it, pin it, copy it, or see links as links. Those actions are the difference between a text box and a conversation.

## Solution

Each message offers contextual actions. Reply quotes another message in the same conversation. Edit and delete follow time and role rules and leave an honest marker. Forward copies text into another conversation the member belongs to, without exposing the source conversation. Pin marks one message. Links in text render as links without fetching the destination.

## User Stories

1. As a sender, I want to reply to a specific message, so that the other person sees what I am answering.
2. As a member, I want the reply quote to show the original text, or a tombstone if that message was deleted for everyone, so that the quote stays honest.
3. As a member, I want a reply targeted at another conversation's message to fail, so that quotes cannot leak across chats.
4. As a sender, I want to edit my own text message, so that I can fix a mistake.
5. As a member, I want an edit after 15 minutes refused, so that history stays stable.
6. As a member, I want someone else's message to be uneditable by me, so that only the sender edits.
7. As a member, I want an edited message to keep its id and gain `edited_at`, so that clients reconcile one row.
8. As a member, I want a deleted-for-everyone message to be uneditable, so that a tombstone cannot be rewritten into new text.
9. As a member, I want to delete a message for myself, so that it leaves my timeline and stays for others.
10. As a member, I want delete-for-me to be reversible only by not existing as an undo in this spec, so that the hide is durable. I want a second hide to be idempotent.
11. As a sender, I want to delete for everyone within 48 hours, so that I can retract a recent message.
12. As a group admin or owner, I want to delete any group message for everyone without the 48-hour limit, so that moderation can remove content.
13. As a member, I want a retracted message's body withheld from later fetches, so that clients cannot keep showing it from the server.
14. As a member, I want the delete confirmation to say whether the delete is for me or for everyone, so that I do not confuse the two.
15. As a member, I want to forward a text message into another conversation I belong to, so that I can share it.
16. As a member, I want the forwarded message to be a new message with the copied text and a forwarded flag, so that the recipient does not receive the source conversation id.
17. As a member, I want forward into a conversation I am not in to fail, so that forward is not an access bypass.
18. As a member, I want to pin a message and unpin it, so that an important message is marked.
19. As a member in a direct chat, I want either member to pin, so that pin is not owner-only there.
20. As a member in a group, I want only an admin or owner to pin, so that group pin matches moderation power.
21. As a member, I want to copy message text, so that I can paste it elsewhere.
22. As a member, I want URLs in text to be links with a visible accessible name, so that I can open them.
23. As a member, I want those links not to cause the server to fetch the URL, so that a message cannot make Pulse call an arbitrary host.
24. As a member, I want actions unavailable when they do not apply, shown disabled with a reason, so that the menu teaches the rule.
25. As a member, I want the menu as a context menu on desktop and a bottom sheet on a small screen, so that the same actions fit the device.
26. As a member using the keyboard, I want the menu to trap and restore focus, so that I can operate actions without a pointer.
27. As a member, I want action labels in Arabic, English, and French, so that the menu matches my locale.
28. As a member, I want a failed edit or delete to leave the previous message visible and show an error, so that failure is recoverable.
29. As a recipient, I want an edit or delete-for-everyone to arrive over the existing conversation realtime channel as a row change, so that I do not need a refresh. This spec writes the row; the messaging subscription already applies row changes.
30. As a member, I want jump-to-the-replied-message to scroll within the loaded timeline, so that a quote is navigable when that message is loaded. If it is not loaded, I want the action to ask the timeline to load older pages until it is found or the history ends.

## Implementation Decisions

- Service operations: `editMessage`, `hideMessage`, `deleteForEveryone`, `forwardMessage`, `pinMessage`, `unpinMessage`. Reply is `sendText` with `replyToId`, called by this spec's client, not a new writer.
- `editMessage`: caller is the sender, type is `text`, `deleted_at` is null, `created_at` is within 15 minutes, body is non-empty and at most 4000 characters. Sets `body` and `edited_at`. Otherwise `message_actions.not_allowed` or `message_actions.invalid_body`.
- `hideMessage`: inserts `message_hides` for the caller and the message. The caller must be a member. Idempotent. Does not change the message row.
- `deleteForEveryone`: sender within 48 hours, or a group `admin` or `owner` when the conversation type is `group`. Sets `deleted_at` and `deletion_scope` to `everyone`. Does not physically remove the row. Subsequent reads already hide the body via the messaging query; this service must also avoid returning the body.
- `forwardMessage`: caller is a member of the source and the target conversation, source message is text and not deleted for everyone, and not hidden for the caller. Creates a new text message in the target with a new client id, the copied body, `forwarded` true, and no `replyToId`. Does not copy reactions or attachments. Notifies target members through `notify`.
- `pinMessage` and `unpinMessage`: in a direct conversation any current member may pin; in a group only `admin` or `owner`. Sets or clears `pinned_at`. One visual pin list can show every message with `pinned_at` set; do not force a single pin.
- Copy happens in the browser from the text already loaded. There is no server copy operation.
- Link display is a renderer in the bubble: split the already-loaded text on URLs and emit anchors with `rel="noreferrer noopener"` and an accessible name that is the URL. Scheme allowlist: `https` and `http`. Do not add a preview fetch.
- Contributions register on `messageAction`. The messaging page already mounts that slot. Do not edit the messaging page except if the slot is missing because the messaging spec drifted; if you must touch it, the only allowed change is mounting the existing slot.
- Confirmations for both deletes are explicit about scope. Destructive actions are visually separated.
- Reply uses a `composerTool` banner. The banner shows the quoted message and sends through the existing `sendText` with `replyToId`. Do not replace the main composer and do not edit `sendText`.
- Jump-to-reply scrolls to a bubble that has `data-message-id`. Adding that attribute on the existing bubble is allowed if it is absent. Do not restyle the timeline. If the node is missing, load older pages through `listMessages` until the id appears or history ends.
- Client state for the open menu, pending action, and reply target is a message-actions context and reducer.
- Catalogs in Arabic, English, and French. Time-limit explanations are full sentences.

## Testing Decisions

Service tests with user-scoped clients and a direct conversation created through the messaging service. Cover: edit within 15 minutes and rejection after; non-sender cannot edit; hide visible to the other user; delete-for-everyone hides the body from both fetches; a non-admin cannot delete someone else's message after the window; a group admin can; forward creates one new message in the target and does not include the source conversation id in the stored body or metadata; forward to a non-member conversation fails; pin by a group member who is not admin fails; pin by a direct member succeeds; reply via `sendText` with a foreign message id fails.

Do not assert menu markup in unit tests. One browser check: the actions button has an accessible name in Arabic. Deeper UI journeys are the browser-journeys spec.

No prior action tests. Reuse the messaging service to set up conversations.

## Out of Scope

- Reactions.
- Editing image or file messages.
- Server-side link previews and embeds.
- Undo send as a separate timer beyond delete-for-everyone.
- Editing the read-cursor logic.

## Further Notes

Implement this spec only. The spine already shows edited markers and tombstones from columns. Your job is the transitions and the menu.
