# Pulse: search

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** `/app/search` and the search service for conversations and messages, plus the in-conversation search contribution on the thread header.

**Must not edit:** people-search on the contacts route, `decideInteraction`, the messaging list implementation, or the foundation migration. People lookup stays in discovery. This spec searches conversations and message text the member is allowed to read.

## Problem Statement

Once a member has history, they cannot find an earlier message or a conversation by text. Discovery finds people by exact username only. Nothing retrieves the member's own history.

## Solution

Global search returns people results by reusing the discovery service, plus conversations and messages the member can read. In-conversation search runs on one thread. Results show a snippet with the match highlighted and open the conversation at that message. Queries are limited and indexed for the patterns this spec actually runs.

## User Stories

1. As a member, I want a global search destination, so that I can look across Pulse from one place.
2. As a member, I want global search to include people via exact username, so that I do not learn a second people-search behavior. People results come from the discovery service.
3. As a member, I want to find a conversation by its group title or by the other member's display name or username, so that I can open the right chat.
4. As a member, I want to find a message by a word in its body, so that I can get back to something that was said.
5. As a member, I want message search limited to conversations I belong to, so that I never see another group's texts.
6. As a member, I want hidden and deleted-for-everyone messages omitted, so that search does not resurrect them.
7. As a member, I want a snippet around the match, so that I can tell why the row matched.
8. As a member, I want the matched term highlighted, so that it stands out in the snippet.
9. As a member, I want to open a result in the conversation, so that I land on that message.
10. As a member, I want in-conversation search to look only at the open thread, so that a hunt inside one chat stays there.
11. As a member, I want an empty result state, so that a miss is not a blank page.
12. As a member, I want a short query (under two characters) not to run a message scan, so that I do not fire huge queries by accident.
13. As a member, I want search rate limited, so that the foundation search limit applies.
14. As a member, I want results paginated, so that a common word does not return the entire history at once.
15. As a member, I want search copy in Arabic, English, and French, so that the screen matches my locale.
16. As a member using the keyboard, I want the field, results, and jump action accessible, so that I can search without a pointer.
17. As a member, I want pending upload messages and system-only noise handled consistently: system messages are searchable by their localized label only if the stored metadata event is matched by a simple event filter, and pending uploads are excluded. Plain text and ready attachment file names are searchable.
18. As a member, I want a jump to a message that is not on the loaded page to still open the chat route with that message id, so that the thread can load it.

## Implementation Decisions

- Service operations: `searchGlobal({ query, cursor })`, `searchConversation({ conversationId, query, cursor })`.
- People section: if the normalized query is a valid username, call the discovery `searchByUsername` and include at most one person. Do not reimplement privacy.
- Conversation section: membership with `left_at` null, and (group title contains the query case-insensitively, or the other direct member's display name or username contains it). Cap 20.
- Message section: member conversations only; `deletion_scope` is not `everyone`; no `message_hides` for the caller; `metadata.upload` is not `pending` when that key exists; body or attachment file name contains the query. Minimum query length 2. Page size 20. Order by `created_at` descending.
- Use a Postgres index that matches this query if the foundation indexes are not enough. A new migration may add an index on `messages (conversation_id, created_at desc)` which already exists, or a `pg_trgm` index on `messages.body` if the extension is available. If `pg_trgm` cannot be enabled, use `ILIKE` with the conversation membership filter and the existing conversation-scoped index, and keep the page size small. Do not build a second search engine.
- Snippet: up to 80 characters around the first match. Highlight in the client by splitting the snippet, not by injecting HTML from the server. The server returns `snippet` and `matchStart` indexes.
- Jump navigates to `/app/chats/{conversationId}?message={messageId}`. The messaging timeline may ignore the query. This spec may add a listener for that query param that scrolls to `[data-message-id]` and, if missing, calls `listMessages` until the id is found or 10 pages are loaded. That listener is an allowed small addition to the chat route if the param is not already honored. Do not restyle the thread.
- In-conversation UI is a `headerStatus` or a dedicated search field contribution that does not remove the typing header. Use a `composerTool` only if it would clutter the composer. Prefer a `rightPanelTab` labeled search if the header is crowded. The global page is `/app/search`. Pick the right-panel tab plus the global page so the typing header stays untouched.
- Debounce global input by 300ms. Submit runs immediately.
- Catalogs in Arabic, English, and French. Empty, loading, and error states exist.
- Call `limit` for search users on each global search execution, including message search, so one limiter covers the action.

## Testing Decisions

Service tests: a member finds their message and a non-member does not; deleted-for-everyone and hide are excluded; a one-character query returns no message rows and `ok: true`; group title match works for a member only; people search returns null for a blocked username; pagination returns a second page; rate limit returns `platform.rate_limited`; snippet does not include text outside the message body.

Browser: the search page has an accessible field in Arabic. Highlighting can be asserted by checking the snippet text is present. Cross-user leakage is a service test, not a visual test.

No prior search tests. Create messages through the messaging service.

## Out of Scope

- A separate full-text cluster, embeddings, or semantic search.
- Searching inside file contents.
- Saved searches other than what discovery already stores for usernames.
- Admin search across all tenants.

## Further Notes

Implement this spec only. Exact people search remains the discovery service. This spec calls it and adds history search.
