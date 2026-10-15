# Pulse: chat status, presence and lightness

**Status:** ready-for-agent

**Wave:** polish (after direct-messaging, typing-presence)

**Blocked by:** direct-messaging, typing-presence, `20261014010000_message_delivery.sql`

**Owns:** message receipt states, the conversation header subtitle, the connection indicator, chat render cost. Branch `feat/chat-status-ux` off `fix/otp-rtl-default-locale`.

**Must not edit:** OTP, RTL or locale work on the base branch, `decideInteraction`, existing migrations, `package.json`.

## Problem Statement

Receipts exist but regress (delivered falls back to sent), read fires when a chat opens rather than when a message is seen, every own message shows a tick, and a failed message can only be retried. The header shows "Reconnecting…" next to presence the moment any socket status blinks, including in background tabs. Presence sticks online after a tab closes or the laptop sleeps, and "last seen" is fetched once and never refreshed. Every composer keystroke re-renders the whole chat because all messaging state sits in one context value.

## Solution

Receipts merge monotonically and read is driven by what is visible, batched into one write. The header subtitle is one priority-ordered value (typing > online > last seen > nothing) and connection health moves to a separate slim indicator that appears only after a 3 s grace period. Presence follows the page lifecycle. Messaging state is split into slice contexts and typing lives in a tiny external store, so a typing tick re-renders the header (and the list row), not the timeline.

## User Stories

1. As a sender, I want a clock while my message is sending, one check when it is stored, two checks when it reaches the other device and accent-coloured checks when it is read, so that the tick tells the truth.
2. As a sender, I want delivered or read never to fall back to an earlier state after a reconnect or refetch, so that ticks do not flicker.
3. As a sender, I want the status only on the last message of my latest group, with a text label for screen readers, so that the thread is not noisy.
4. As a sender, I want a failed message to offer Retry and Discard that work from the keyboard, so that I can recover.
5. As a sender who is offline, I want my message to stay visibly pending and send by itself when the network returns.
6. As a recipient, I want "delivered" to fire when my client receives the message, even with the chat closed.
7. As a recipient, I want "read" to fire only for messages that were actually on screen while the tab was visible and focused, and never when either of us turned read receipts off.
8. As a member, I want the header subtitle to show typing, else online, else last seen (privacy permitting), else nothing, with no layout shift when it changes.
9. As a member, I want the connection indicator only when the connection has really been down for about 3 s, never for a background tab or a brief blip, and "Waiting for network" when the device is offline.
10. As a member, I want the other person to show offline soon after they close the tab, hide it or their device sleeps.
11. As a member, I want the chat list to show the unread badge, last message status tick and "typing…" for chats whose channel is open.
12. As a member, I want sending to feel instant: the bubble appears at once, the composer keeps focus, the view sticks to the bottom only if I was there, otherwise a "New messages" pill appears.
13. As a screen-reader user, I want typing announced politely, and as a reduced-motion user no animated dots.

## Implementation Decisions

### Receipts (worker A)

- `rankDelivery`: pending 0 < sent 1 < delivered 2 < read 3. `failed` is local only.
- `mergeDetailMonotonic(prev, next)` in `delivery.ts`: `other_last_delivered_at` = max; other read cursor = later of the two by `(created_at, id)`; own `last_read_*` = later. Exception: if `next.other_send_read_receipts === false`, read cursor fields come from `next` (privacy turns read off, it is not a regression). The reducer's `detail/set` always goes through it. `receipts/set` merges per conversation: keep the higher rank only while the newest message id is unchanged (a new message legitimately restarts at sent). So `ConversationReceiptStatus` entries carry `messageId`.
- Reciprocity: new migration `20261015000000_read_receipt_reciprocity.sql` re-creates `get_conversation` and `conversation_receipts` so the other read cursor is exposed only when **both** `op.send_read_receipts` and the viewer's own `send_read_receipts` are true. PGlite test for both directions.
- Delivered: `mark_delivered` stays as is (debounced call when the inbox or the open conversation channel delivers a row). No change to when it fires except that the open conversation channel also schedules it (shared debounce).
- Read: `useReadTracker(conversationId, rootRef)` with one `IntersectionObserver` (threshold 0.6) on incoming bubbles. A message counts as seen only while `document.visibilityState === "visible"` and `document.hasFocus()`. The newest seen incoming message is flushed at most every 300 ms as one `markReadAction`, never for an older message than the last one sent. The unconditional "mark latest on open" and "mark every realtime insert" paths are removed.
- Offline queue: when `navigator.onLine === false` the provider sets connection status `offline` and does not call `sendTextAction`; pending items stay `pending` and flush on `online` / `SUBSCRIBED`. A thrown server action marks the item `failed` (today it stays pending forever).
- `discardSend(clientId)` removes a pending or failed item.
- Context split (same provider, no new deps): `MessagingActionsContext` (stable callbacks), `ConversationContext` slices read through hooks below. `useMessaging()` keeps its current shape for other features.

### Subtitle, presence, connection (worker B)

- `src/platform/typing-store.ts`: module-level store `{ [conversationId]: TypingEntry[] }` with `setTyping`, `subscribeTyping`, `useTyping(conversationId, viewerId)` (`useSyncExternalStore`). Expiry is one timer per store set to the next `expiresAt`, not a 500 ms interval. The typing-presence provider writes to it; header and list read from it.
- `deriveSubtitle(input): Subtitle` in `typing-presence/subtitle.ts`, pure: `{kind:"typing", label}` > `{kind:"online"}` > `{kind:"lastSeen", at}` > `{kind:"none"}`. Online requires `canShowPresence` allow and the peer's key in channel presence while our channel is `SUBSCRIBED`. Last seen requires `show_last_seen`. Relative time through next-intl `format.relativeTime`, absolute date after 7 days.
- Subtitle element has a fixed line height and is always rendered (empty when `none`). `aria-live="polite"` only on the typing text. Dots are CSS and static under `prefers-reduced-motion`.
- Typing: send at most once per 3 s, expire 4 s after the last start, `stopped` on idle 3 s, clear, send or unmount. Own id never shown. No DB writes.
- Presence lifecycle: channel effect depends only on `conversationId` and `viewerId` (today it re-subscribes when the subject row loads, which flaps the peer's presence). Track on `SUBSCRIBED`; clear the online set on any non-`SUBSCRIBED` status; `pagehide` untracks at once; `visibilitychange` hidden untracks after 30 s, visible re-tracks. When the peer's key leaves presence, refetch the subject row once so last seen is fresh. `last_seen_at` touch stays throttled to 5 min.
- `ConnectionIndicator` (`direct-messaging/components/ConnectionIndicator.tsx`, logic in `direct-messaging/lib/connection-indicator.ts`): input `status: "connected" | "reconnecting" | "offline"`. Shows only after the status has been non-connected for 3000 ms while the document is visible (hidden time does not count; becoming visible restarts the grace). Offline label "Waiting for network", otherwise "Connecting…". Absolutely positioned slim bar, so no layout shift. Clears at once on connected.

### UI (worker C)

- Status on the last bubble of my newest consecutive group only (`lib/status-grouping.ts`: `statusMessageId(timeline, viewerId)`). Older own messages show no tick; failed messages always show their state and actions.
- Icons: clock, check, check-check, check-check with `--accent`; icons are not mirrored (checks read the same in RTL), but their position uses logical properties. Each status has a visually hidden text label.
- Failed: Retry and Discard buttons, 44 px targets, focus ring.
- `MessageBubble` memo with stable props: pass `delivery` (computed in the timeline) instead of the whole `detail`; `onRetry`/`onDiscard` from the stable actions context.
- Timeline: stick to bottom only if at bottom before the update; otherwise show the "New messages" pill with count. Composer keeps focus after send. Keep previous content (no flash) while a conversation refetches.
- List rows: unread badge, last-message tick, `typing…` from `useTyping` for joined conversations. Typing for chats whose channel is not joined is out of scope (it would need one channel per row, which the channel budget forbids).
- Dynamic import (`next/dynamic`) for non-critical overlays found in the chat route (pickers, info panel extras) if the build shows them in the first load JS.
- No virtualization unless the 200-message measurement shows jank.

### Shared contracts (agreed before fan-out)

From `direct-messaging/context/MessagingProvider.tsx` (A):

```ts
useMessagingActions(): { sendMessage, retrySend, discardSend, setDraft, loadOlderMessages, refreshConversation } // stable identities
useConversationView(id): { messages: TimelineMessage[]; pending: PendingSend[]; detail?: ConversationDetail; hasMore: boolean; separatorId: string | null }
useDraft(id): string
useConnection(): { status: "connected" | "reconnecting" | "offline" }
useInbox(): { conversations: ConversationSummary[]; hasMore: boolean; receipts: Record<string, { status: ConversationReceiptStatus; messageId: string }> }
useReadTracker(conversationId, rootRef): (message: TimelineMessage) => (el: Element | null) => void
```

From `delivery.ts` (A): `rankDelivery`, `mergeDetailMonotonic`, `outboundDeliveryStatus` (unchanged signature).
From `src/platform/typing-store.ts` (B): `useTyping(conversationId, viewerId?): { userId: string; displayName: string }[]`.
From `direct-messaging/components/ConnectionIndicator.tsx` (B): `<ConnectionIndicator status={...} />`.

### Catalog keys (i18n worker, added before A/B/C)

`direct-messaging`: `connection.waitingForNetwork`, `connection.connecting`, `discardSend`, `failedActions`, `list.typing`, `delivery.queued`.
`typing-presence`: `typing` ("typing…", direct chats), `lastSeenRelative` ("last seen {when}"), `lastSeenJustNow`.

## File ownership

| Worker | Files |
| --- | --- |
| A receipts (Sonnet) | `direct-messaging/context/**`, `delivery.ts`, `delivery.test.ts`, `hooks/useReadReceipts.ts(+test)`, new migration above, `tests/db/read-receipt-reciprocity.test.ts` |
| B subtitle (Sonnet) | `typing-presence/**` except `messages/`, `src/platform/typing-store.ts(+test)`, `direct-messaging/lib/connection-indicator.ts(+test)`, `direct-messaging/components/ConnectionIndicator.tsx(+test, .module.css)` |
| C UI (Sonnet, after A merges) | `direct-messaging/components/{ThreadPanel,MessageBubble,MessageTimeline,MessageComposer,ConversationList}.tsx` and their tests, `direct-messaging.module.css`, `lib/status-grouping.ts(+test)` |
| i18n (Haiku) | `direct-messaging/messages/*.json`, `typing-presence/messages/*.json` |
| e2e (Sonnet) | `e2e/chat-status.spec.ts` |
| coordinator | this spec, `tests/perf/chat-render-count.test.tsx`, merges, PR |

A and B run in parallel in separate worktrees. C starts on top of A and B.

## Testing Decisions

- Unit: `mergeDetailMonotonic` and `receipts/set` never lower a rank, privacy-off clears read, new message restarts at sent; `deriveSubtitle` priority table; typing store expiry and own-id filtering with fake timers; connection indicator grace (2.9 s nothing, 3 s shown, hidden time ignored, connected clears); read tracker batches 10 visible messages into one call and skips when hidden or unfocused; status grouping picks one message.
- DB (PGlite): reciprocity in both directions.
- Component: bubble shows the label for each state and Retry/Discard; header renders fixed-height subtitle per kind.
- Perf: `tests/perf/chat-render-count.test.tsx` records renders per event in a 200-message thread; before/after go in the PR.
- Browser: `e2e/chat-status.spec.ts`, two contexts: send, sent → delivered → read, typing shows and expires, offline shows the indicator only after the grace period. Skips without a live Supabase, as `shell.spec.ts` does.

## Out of Scope

Typing in list rows for chats whose channel is not joined; global online list; timeline virtualization (unless measured jank); new tables; new dependencies.
