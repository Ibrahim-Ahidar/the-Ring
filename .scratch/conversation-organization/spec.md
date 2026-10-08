# Pulse: conversation organization

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** chat folders, pin, mute, and archive controls, and the list-item menu contribution.

**Must not edit:** the conversation list query's sort and filter, except if pinned, archived, or folder behavior from the foundation contract is missing. The messaging spec already sorts pinned first, hides archived unless asked, and filters by `folderId`. This spec writes those columns and builds the controls.

## Problem Statement

A member with more than a few conversations cannot pin an important chat, mute a noisy one, archive something finished, or group chats into folders. The columns exist and the list already honors them, but there is no way to set them.

## Solution

From each conversation, a member can pin, mute for a chosen duration, and archive. They can create folders, name them, reorder them, and put conversations in them. The list, already built to read these fields, reflects the change. Mute also stops notifications through the existing `notify` port.

## User Stories

1. As a member, I want to pin a conversation, so that it stays at the top of my list.
2. As a member, I want to unpin it, so that it returns to activity order.
3. As a member, I want my pin to affect only my list, so that the other person is not forced to pin the same chat.
4. As a member, I want to archive a conversation, so that it leaves the main list.
5. As a member, I want to see archived conversations when I ask, so that I can find them again.
6. As a member, I want to unarchive a conversation, so that it returns to the main list.
7. As a member, I want to mute a conversation for 1 hour, 8 hours, 1 day, 1 week, or until I turn it off, so that I choose the duration.
8. As a member, I want a muted conversation not to create in-app notifications until the mute expires, so that `notify` honors `muted_until`.
9. As a member, I want mute to expire on its own, so that I do not have to remember to unmute a timed mute.
10. As a member, I want to unmute immediately, so that alerts return.
11. As a member, I want a mute indicator on the list row, so that I can see the state. The messaging list shows it when `muted_until` is in the future; this spec sets the timestamp.
12. As a member, I want to create a folder with a name, so that I can group chats.
13. As a member, I want to rename and delete a folder, so that I can keep the list tidy.
14. As a member, I want deleting a folder to leave the conversations in the main list, so that deletion does not archive or destroy chats.
15. As a member, I want to put a conversation in one folder or remove it, so that placement is simple. A conversation lives in at most one of my folders.
16. As a member, I want to reorder folders, so that the folder strip matches my priority.
17. As a member, I want the folder strip to filter the list via the folder query the messaging list already understands, so that this spec does not rewrite the list.
18. As a member, I want an empty folder explained, so that a folder with no chats is understandable.
19. As a member, I want another member's folders to be invisible to me, so that organization is private.
20. As a member, I want these controls in Arabic, English, and French, with mute durations pluralized where needed, so that the menu matches my locale.
21. As a member on a small screen, I want the menu as a bottom sheet, so that organization actions fit the phone.
22. As a member using the keyboard, I want the menu and folder dialog to trap and restore focus, so that the actions are accessible.
23. As a member, I want a failed update to keep the previous pin, mute, or archive state, so that an error does not lie.

## Implementation Decisions

- Service operations: `pinConversation`, `unpinConversation`, `archiveConversation`, `unarchiveConversation`, `muteConversation({ until })`, `unmuteConversation`, `createFolder`, `renameFolder`, `deleteFolder`, `reorderFolders`, `moveToFolder`, `removeFromFolder`, `listFolders`.
- All operations act on the caller's membership or the caller's folders. A conversation the caller is not an active member of returns `organization.not_found`.
- Pin sets `pinned_at` to now. Unpin clears it. Archive sets `archived_at`. Unarchive clears it. These are per membership, not on the conversation row.
- Mute sets `muted_until` to the computed timestamp, or null for "until I turn it off" represented as a far timestamp of 100 years so the existing `notify` comparison (`muted_until` in the future) works without a schema change. Unmute sets `muted_until` null. Durations: 1 hour, 8 hours, 24 hours, 7 days, and indefinite.
- Folders: name 1–40 characters. `position` is a dense integer per user. `moveToFolder` replaces any existing `conversation_folder_items` row for that conversation in the caller's folders so the conversation is in one folder. `deleteFolder` deletes items and the folder and does not set `archived_at`.
- The folder strip is a contribution rendered above the list. If the messaging page has no mount point for it, an allowed edit is to render a single `listItemMenu` area and a folder-strip slot that already exists in the foundation contribution kinds. Foundation kinds do not include a folder strip. Use `nav` only for real destinations. Render the folder strip as part of the chats route header by an allowed addition: a slot host element with a stable id `conversation-folders` that this spec's component fills when the chats page loads it. If the chats page is owned by messaging, add one line that mounts `<slot name="conversation-folders">` if absent. Do not change list sorting code.
- The list-item menu contribution contains pin, mute, archive, and add-to-folder.
- Filtering: folder controls navigate to `/app/chats?folder={folderId}`. Archived view navigates to `/app/chats?archived=1`. The messaging list already accepts `includeArchived` and `folderId`. Wire those query params in the chats page if they are not read yet. That wiring is allowed. Do not rewrite the query implementation.
- Client state is an organization context and reducer. Menu rows are memoized.
- Catalogs in Arabic, English, and French in this module.

## Testing Decisions

Service tests: pin on caller membership does not set the other member's `pinned_at`; archive hides the conversation from the default `listConversations` and shows it when `includeArchived` is true; mute sets `muted_until` and a following `notify` for that conversation does not insert; unmute allows `notify` again; a second user cannot pin the first user's membership; folder move is exclusive; delete folder keeps the conversation unarchived; non-member returns `organization.not_found`; reorder persists positions.

Browser: the chats page shows an accessible folder control in Arabic when the member has no folders (empty state). Do not depend on a screenshot.

No prior organization tests. Use the messaging list service to assert filters.

## Out of Scope

- Nested folders and shared team folders.
- Notification preference screens (notifications spec).
- Marking a conversation unread manually.
- Per-folder notification settings.

## Further Notes

Implement this spec only. If the list already hides archived rows, do not reimplement that filter. Write `archived_at` and prove the existing list honors it.
