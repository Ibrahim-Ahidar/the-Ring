# Pulse: discovery and contacts

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/app/search` is not this spec. This spec owns `/app/contacts`, `/username/[username]`, `/app/profile/[username]`, and the discovery application service.

**Must not edit:** `decideInteraction`, the search-messages feature, the shell, the foundation migration, or the package manifest. People search lives here. Message search is the search spec.

## Problem Statement

A member who knows someone's username cannot find them, open a privacy-respecting profile, or mark them as a favorite. Pulse's identity model depends on exact username discovery rather than phone numbers.

## Solution

Exact username search finds one profile when the safety decision for `discover` is allow, and shows the same empty result when the person is missing or hidden. Recent searches are remembered for the member. A public profile page shows the fields they are allowed to see, including shared groups once groups exist as data, without this spec building group management. Favorites are a contact list independent of conversation order.

## User Stories

1. As a member, I want to search by exact username, so that I can find a person without browsing a directory.
2. As a member, I want search to ignore case and extra spaces, so that `Ibrahim` matches `ibrahim`.
3. As a member, I want a missing username and a hidden username to look the same, so that I cannot tell whether an account exists.
4. As a member, I want a person who turned discoverability off to be absent from search, so that their privacy setting works.
5. As a member, I want a private profile to be absent from search, so that profile visibility is enforced.
6. As a member, I want a contacts-only profile to appear only if one of us has favorited the other, so that contacts visibility matches the predicate.
7. As a member, I want a blocked person in either direction to be absent from search, so that a block hides them.
8. As a member, I want my own username to return my profile, so that I can open it.
9. As a member, I want a successful search stored in recent searches, so that I can repeat it.
10. As a member, I want recent searches listed newest first and limited, so that the list stays short.
11. As a member, I want to clear one recent search or all of them, so that I can remove history on this device account.
12. As a member, I want a profile page with display name, username, bio, and avatar, so that I can recognize the person.
13. As a member, I want online and last seen on that profile only when presence visibility allows it, so that hidden presence stays hidden.
14. As a member, I want shared groups listed when membership data says we share a group, so that the profile has context. If I have no shared groups, I want an empty line, not an error.
15. As a member, I want to favorite a person, so that I can keep a contact list apart from chats.
16. As a member, I want to unfavorite a person, so that they leave my contacts.
17. As a member, I want favorites listed with display name and username, so that I can open their profile.
18. As a member, I want an empty contacts state that tells me to search by username, so that the first visit is understandable.
19. As a member, I want repeated favorite taps to stay one row, so that double submission is safe.
20. As a member, I want search debounced, so that I do not fire a request per keystroke. Exact search still runs on submit immediately.
21. As a member, I want search over the foundation rate limit refused, so that username enumeration is slowed down.
22. As a member, I want a public profile route that a signed-out visitor can open only when discovery would allow a generic visitor, so that private profiles are not world-readable. Signed-out visitors may see a profile only when `discoverable` is true and `profile_visibility` is `public`. Otherwise they see not-found.
23. As a member, I want discovery copy in Arabic, English, and French, so that search and contacts match my locale.
24. As a member using the keyboard, I want the search field, results, and favorite action labeled, so that I can complete the flow without a pointer.
25. As a member, I want a start-conversation action on the profile that links to the new-chat route with that username, so that messaging can open the chat later without this spec creating conversations.

## Implementation Decisions

- Service operations: `searchByUsername(raw)`, `listRecentSearches`, `clearRecentSearch`, `clearAllRecentSearches`, `getProfile(username)`, `listFavorites`, `favorite`, `unfavorite`.
- Normalize the query with the foundation normalizer before lookup. If the normalizer rejects the string, return an empty search result and `ok: true` rather than a validation error, so the UI shows no one found.
- `searchByUsername` calls `limit` for search, then loads the profile by `normalized_username`, then `decideInteraction(actor, target, "discover")`. `deny` and a missing row both return `{ ok: true, value: null }`. `allow` returns the public card: id, username, display name, avatar, bio. It does not return email.
- A successful visible search inserts a `recent_searches` row. Keep the latest 10 per user; delete older ones in the same operation.
- `getProfile` uses the same visibility rules. For a signed-out viewer, allow only public and discoverable profiles; otherwise `discovery.not_found`.
- Presence on the profile: call `decideInteraction` for `presence`. If it denies, omit online state. If `show_last_seen` is false or a block denies presence, omit `last_seen_at`. Do not write `last_seen_at`.
- Shared groups: query conversations of type `group` where both users have a membership with `left_at` null. Return id and title only. If the groups spec has not created any, the list is empty.
- Favorites write the caller's `favorites` row. Favoriting oneself returns `discovery.cannot_favorite_self`. Duplicate favorite returns the existing row. Unfavorite when missing returns `discovery.not_found`.
- The profile's start-conversation control is a link to `/app/chats/new?username={username}`. Do not call `openDirect`.
- Client state is a discovery context and reducer: query, result, recents, favorites. Debounce input-driven search by 300ms; submit bypasses the wait. Presentational cards are memoized.
- Catalogs in Arabic, English, and French in the discovery module. Empty, loading, and no-result states are required. No-result copy does not say whether the account exists.
- Navigation contribution for contacts.

## Testing Decisions

Service tests with user-scoped clients. Cover: case-insensitive hit; missing and undiscoverable and blocked all return null; contacts-only visibility before and after favorite; signed-out public allow and private deny; recent search cap at 10; favorite idempotency; a second user cannot read the first user's recent searches or favorites; rate limit returns `platform.rate_limited` and does not insert a recent search; shared group query returns a group both belong to and omits a group the viewer left.

Browser: contacts empty state in Arabic has an accessible search field. The two-person find flow in a real browser is the browser-journeys spec.

No prior discovery tests. Use the foundation harness.

## Out of Scope

- Searching messages or conversation titles (search spec).
- Creating the direct conversation (direct messaging).
- Suggested people, contacts import, and phone-number discovery.
- Editing the other person's profile.

## Further Notes

Implement this spec only. Global search of messages is a different route and a different spec. People lookup from the contacts page is the discovery behavior.
