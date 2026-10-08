# Pulse: typing and presence

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** the typing and presence feature module, its `headerStatus` contribution, and throttled writes to `last_seen_at`.

**Must not edit:** the conversation page, the messaging service, the foundation migration, `decideInteraction`, or the package manifest. The messaging spec renders the header slot. This spec fills that slot.

## Problem Statement

A conversation never shows that the other person is online or typing. Those signals are easy to implement badly by writing a database row for every keystroke or heartbeat, which Pulse explicitly avoids.

## Solution

Typing is a short-lived broadcast on the conversation channel. Presence is ephemeral channel state plus a throttled last-seen timestamp. Viewers see online or last seen only when the foundation presence decision and last-seen flag allow it. A lost "stop typing" event expires on its own.

## User Stories

1. As a member with a conversation open, I want to broadcast that I am typing when I type in the composer, so that the other person sees activity.
2. As a member, I want typing to stop broadcasting after I pause, so that I do not look stuck typing.
3. As a member, I want the other person's typing label to disappear if the stop event never arrives, so that a dropped packet cannot pin the label on.
4. As a member, I want my own typing not to show as a label to myself, so that the indicator is about other people.
5. As a member, I want a typing label that names the other person in a direct chat, so that I know who it is.
6. As a member, I want several typers in a group summarized with a pluralized label, so that a group does not list an unbounded sentence built by concatenation.
7. As a member, I want typing events not to create messages or notifications, so that drafts of activity stay ephemeral.
8. As a member with a conversation open, I want my presence on that conversation channel marked online, so that members viewing it can see I am here.
9. As a member, I want to appear offline when I leave or disconnect, so that presence does not stick.
10. As a member, I want another person's online dot only when their presence decision is allow, so that hiding online status works.
11. As a member, I want last seen only when `show_last_seen` is true and presence is not blocked, so that the timestamp is privacy-controlled.
12. As a member, I want last seen updated at most once every five minutes while I am active, so that heartbeats are not stored as rows.
13. As a member, I want the presence dot to animate only when reduced motion is off, so that the foundation motion rule holds.
14. As a member, I want the typing and presence strings in Arabic, English, and French, so that the label matches my locale.
15. As a member using a screen reader, I want the typing state announced politely, so that it is available without stealing focus.
16. As a member, I want a refetch of messages not to replay typing, so that typing is never part of reconnect message merge.

## Implementation Decisions

- Do not add tables. Do not insert messages of type system for typing or presence.
- Broadcast on `conversation:{conversationId}` with events `typing.started` and `typing.stopped`, payload `{ conversationId, userId }`. Start when the composer input goes from idle to non-empty, and repeat at most once every 3 seconds while input continues. Send stopped after 3 seconds of idle and when the composer clears or the view unmounts.
- Clients expire a typer locally 4 seconds after the last started event if no stopped event arrives. Use a timer that is cleared on unmount.
- Presence uses Supabase presence on `conversation:{conversationId}` for members who have that conversation open. Track and untrack with the subscription lifecycle.
- While a member is connected, update their `profiles.last_seen_at` at most once per 5 minutes. That is the only write. Skip the write if the previous stamp is newer than 5 minutes ago.
- The header contribution calls `decideInteraction(viewer, subject, "presence")` and checks `show_last_seen` before rendering. Denied presence renders nothing for online. Hidden last seen omits the time. The contribution receives the other members' ids from the conversation header data the slot host passes in. If the host has not merged and the slot is not mounted, this module still exports a pure helper the tests call.
- Pure helpers, tested directly: `reduceTyping(state, event, now)` and `canShowPresence(decision, showLastSeen)`. These helpers are the application seam along with `touchLastSeen(userId, now)` which no-ops inside the 5-minute window.
- Copy uses interpolation and plurals. One typer: a single label with the display name. Two or more: a plural count label. Do not join names into a sentence in code.
- Accessible live region is polite. The dot is not the only signal; include text for online or last seen.
- Client timers live in this feature's context and reducer. Clean them up on unmount.

## Testing Decisions

Test the pure reducers without a browser: a started event shows the user; a stopped event or a 4-second advance hides them; the viewer's own id never appears; two typers produce a count of 2 rather than a concatenated string; events do not imply a message insert.

Test `touchLastSeen` with a user-scoped client: the first call sets `last_seen_at`; a second call one minute later does not change it; a call six minutes later does.

Test `canShowPresence` against the foundation predicate by setting `show_online` and a block: hidden and blocked subjects do not show as online.

Browser: not required beyond the helper behavior. Two-session typing belongs to browser-journeys.

No prior typing tests. Do not assert on channel library internals; assert on the reducer output and the `last_seen_at` column.

## Out of Scope

- A global online user list.
- Storing typing history.
- Pushing a notification because someone typed.
- Editing the message composer or any messaging module. Listen for the window event `pulse:composer` with detail `{ conversationId, activity: "input" | "idle" }`. Direct messaging emits it. If that spec has not merged, the listener and the pure reducers are still complete and tested by calling the reducer directly.

## Further Notes

Implement this spec only. Ephemeral state must survive a missing stop event. If you find yourself inserting a row per keystroke, stop and use the broadcast path.
