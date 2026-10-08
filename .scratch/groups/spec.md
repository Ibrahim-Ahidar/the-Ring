# Pulse: groups

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** `/app/groups`, `/app/groups/new`, `/app/groups/[groupId]`, invite links, membership role changes, and the right-panel members contribution.

**Must not edit:** `sendText`, the direct-open flow, the foundation migration, or the messaging timeline. Group threads are conversations of type `group` shown by the existing chat route. This spec creates and administers them.

## Problem Statement

Members can only talk one to one. They cannot create a group, invite people under privacy rules, assign admins, restrict who can send, or leave. The messaging spine will display a group conversation once membership exists, but nothing creates that membership correctly.

## Solution

A member creates a group and becomes its owner. They can name it, describe it, and set an avatar. Owners and admins invite people who the safety decision allows, share an invite link, promote or demote admins, restrict a member's messaging, remove a member, and review reports that the safety spec already stores. Members can leave. The thread itself stays on the existing chat route.

## User Stories

1. As a member, I want to create a group with a name, so that several people share one conversation.
2. As a member, I want an optional description and avatar, so that the group is recognizable.
3. As the creator, I want to be the owner, so that ownership is explicit from the start.
4. As an owner, I want to invite a member by username when their invite decision is allow, so that privacy is respected.
5. As an owner, I want an invite to someone set to contacts-only to succeed only if we are favorites, so that the predicate is the rule.
6. As an owner, I want an invite that is denied to explain the refusal without creating membership, so that nobody is added silently.
7. As an owner, I want inviting someone already in the group to be idempotent, so that a retry does not duplicate membership.
8. As an owner or admin, I want to create an invite link with an optional expiry and max uses, so that people can join without a direct invite.
9. As a member, I want to join through a valid code, so that I become a member.
10. As a visitor to a revoked, expired, or exhausted link, I want join to fail, so that old links die.
11. As an owner, I want to revoke an invite link, so that it stops working.
12. As an owner, I want to promote a member to admin and demote an admin to member, so that moderation can be shared.
13. As an admin, I want to be unable to demote or remove the owner, so that ownership stays put.
14. As an owner, I want to transfer ownership to another member, so that I can hand the group off, and I become an admin.
15. As an admin, I want to remove a member, so that they lose access.
16. As a removed member, I want my later sends and reads to fail, so that removal is real.
17. As an admin, I want to restrict a member from sending and later lift that restriction, so that `messaging_restricted` is set for the spine to enforce.
18. As a member, I want to leave a group, so that I stop receiving it.
19. As the sole owner, I want leave to require transferring ownership first, so that a group is not ownerless.
20. As an owner, I want to edit the group name, description, and avatar, so that the profile stays current.
21. As an admin, I want to edit the group profile too, so that admins can keep it updated.
22. As a member, I want the member list with roles, so that I know who is in the group.
23. As an admin, I want to see open reports for messages in the group, so that I can mark them reviewed through the safety service.
24. As a member, I want a group capped at 200 current members, so that the portfolio stays bounded.
25. As a member, I want group system messages for join, leave, remove, and promote, so that the thread explains membership changes. System messages are type `system`, not sent by impersonating a person, and they do not increment unread for the actor.
26. As a member, I want group screens in Arabic, English, and French, so that admin tools match my locale.
27. As a member on a small screen, I want group management in a single pane with back, so that admin tools fit a phone.
28. As a member using the keyboard, I want invite, role, and remove actions labeled and confirmed when destructive, so that removal is deliberate and accessible.
29. As a recipient of an invite, I want a notification of type `group.invited`, so that the inbox shows the invite.
30. As a member opening a group thread, I want the existing chat route to load it, so that this spec does not build a second transcript.

## Implementation Decisions

- Service operations: `createGroup`, `updateGroup`, `inviteMember`, `createInviteLink`, `revokeInviteLink`, `joinByCode`, `setRole`, `transferOwnership`, `setMessagingRestricted`, `removeMember`, `leaveGroup`, `listMembers`.
- `createGroup` creates a conversation of type `group` with `direct_pair_key` null, and a membership for the caller with role `owner`. Name is required, 1–80 characters. Description max 300 characters. Avatar uses the same image constants as identity avatars and a server-chosen path. Call `limit` for create conversation. Call `notify` is not required for the creator.
- `inviteMember` calls `decideInteraction(actor, target, "invite")`. `deny` or `request` both refuse with `groups.not_allowed` (there is no request flow for groups). On allow, insert role `member` unless a membership exists. If `left_at` is set, clear it and restore role `member` rather than inserting a duplicate. Enforce 200 members with `left_at` null. Notify the invitee with `group.invited`.
- Roles: `owner` can do everything an admin can, plus transfer ownership, delete is not in this spec (no group hard-delete). `admin` can invite, manage links, update profile, restrict messaging, remove members who are not owners, promote or demote between member and admin, and list group reports. `member` can leave and can send only through the messaging spine when not restricted.
- `setRole` cannot target the owner. `transferOwnership` sets the target to `owner` and the caller to `admin` in one operation. The caller must be the current owner.
- `removeMember` sets `left_at` and `messaging_restricted` false. It does not delete historical messages.
- `leaveGroup` is `removeMember` on yourself, except the owner must transfer first (`groups.owner_must_transfer`).
- Invite codes are unguessable random strings, stored on `invite_links`. Join checks revoked, expiry, and `use_count` against `max_uses`, then increments `use_count` and adds membership. A race that overshoots max uses must not add the extra member.
- System messages: insert type `system` with a body key in `metadata.event` (`joined`, `left`, `removed`, `promoted`, `demoted`) and `metadata.subjectUserId`. Body may be empty. The timeline already renders unknown types with a fallback; add a `messageRenderer` contribution for `system` that uses catalogs and interpolation. Do not concatenate translated fragments in the service.
- Members panel is a `rightPanelTab` contribution. Group admin pages live under `/app/groups/[groupId]`. The open-thread action links to `/app/chats/[conversationId]`.
- Report review calls the safety service `markReportReviewed` and `listGroupReports`. Do not reimplement report storage.
- Client state is a groups context and reducer. Member rows are memoized.
- Catalogs in Arabic, English, and French.
- Pinning group messages and deleting group messages for everyone stay in the message-actions spec, which already keys off role. Do not reimplement them here.

## Testing Decisions

Service tests: create yields one owner membership; second user cannot update the group; invite respects deny and favorite-based allow; duplicate invite is one membership; the 201st member is refused; join honors expiry, revoke, and max uses; admin cannot remove the owner; owner transfer swaps roles; removed member's `sendText` fails; restricted member's `sendText` fails; leave as owner fails until transfer; a non-member cannot list members; system message row exists for an invite join.

Browser: the new-group form renders in Arabic with an accessible name field. Multi-user browser flows are the browser-journeys spec.

No prior group tests. Use `createUser`, the safety favorites and privacy columns, and `sendText` from the messaging service as the enforcement check.

## Out of Scope

- Public communities, broadcast channels, and large-scale discovery of groups.
- Group message requests.
- Hard-deleting a group and its history.
- Voice or video rooms.

## Further Notes

Implement this spec only. Reuse the chat thread. Build administration beside it.
