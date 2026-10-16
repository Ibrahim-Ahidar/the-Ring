# Spec: fast navigation, lazy loading done right

Status: agreed with the maintainer on 2026-10-16 (grilling session). Tickets: GitHub issues labelled `performance` + `ready-for-agent`, each links here.

## Problem

The app is slow in production, worst when going from chats to groups or opening a chat, although it is a simple app.

## Causes (measured from code, 2026-10-16)

1. **Serial Supabase round trips on every navigation**, made worse by the deployment region: Vercel runs in the default US East, Supabase is in eu-west. Per request: `auth.getUser()` (network) → `identity_assert_session_active` RPC → layout `assertAppAccess` (MFA AAL, `identity_assert_device_active`, `identity_touch_device` awaited) → page data. All in series, each one crossing the Atlantic.
2. **Messaging is torn down on every navigation.** `ChatsApp` and `MessagingProvider` (974 lines) are rendered by each page, not by a layout, so opening another chat or switching chats ↔ groups remounts everything. The module-level `inboxCache`/`threadCache` in `ChatsApp.tsx` work around this.
3. **Streaming is wasted.** Pages stream promises (`streamInbox`/`streamThread`), but the client reads them in a `useEffect` (`useSettled`), so it renders a fallback first and the real content second.
4. **Groups list is a blocking full fetch with a bug.** `/app/groups` awaits `listConversations` and filters `type === "group"` on the client, so only groups among the 30 most recent conversations show. There is no `loading.tsx`.
5. **Every /app route ships about 120 kB of extra JS.** `src/shell/generated/features.ts` (from `scripts/gen-features.mjs`) imports all 11 features' contributions **and all ar/en/fr message JSON**. `src/shell/slots/index.ts` imports it on the client, so every locale catalog reaches the browser. Baseline: the shared chunk is 103 kB, while most /app routes are 224–239 kB.
6. **Skeletons are missing or wrong.** Groups has none; the settings skeleton is a single bar that doesn't match the page; skeleton files are `"use client"` for no reason.
7. **Unmeasured but reported:** typing lag in the composer, slow scrolling in long threads, slow first load after login.

## Decisions

| # | Decision |
|---|----------|
| D1 | Vercel functions run in `dub1`, next to Supabase eu-west (`regions` in `vercel.json`). |
| D2 | One auth round trip per request: the JWT is checked locally (`getClaims`), then **one** combined RPC checks session active + device active (+ returns what the layout needs). Revocation stays enforced on every request. Security is never traded for speed. |
| D3 | One messaging store in the `/app` layout (inbox, opened threads, realtime) that survives navigation. Pages hand server promises to it and read them with `use()` + Suspense. `useSettled` and the module caches are removed. |
| D4 | Groups are conversations with more members. The groups **list page is removed**: groups are a filter ("All / Groups") in the chats inbox. `/app/groups` redirects to `/app/chats?filter=groups`. `list_conversations` gets a type filter, which fixes the 30-limit bug. **Create group** (`/app/groups/new`) and **group info** (`/app/groups/[groupId]`, members and settings, opened from the chat header) stay. |
| D5 | Only the active locale's messages are loaded. The generated features file is split: contributions (client) vs messages (server only, loaded per locale). |
| D6 | Every /app route has a `loading.tsx` skeleton that is a server component, matches the real layout (CLS < 0.05), works RTL and LTR and sets `aria-busy`. A screen already in the store (D3) shows instantly with no skeleton. |
| D7 | **No prefetching of data.** Nothing is fetched for a chat until the user opens it, not on hover and not on viewport. Chat-row links use `prefetch={false}`. Contacts are not loaded with the inbox. When a chat opens it loads the last page of messages sized to about 2–3 screen heights (clamped to 20–60 messages); older messages load on scroll up through the existing cursor. |
| D8 | Long threads are virtualized with `@tanstack/react-virtual` (dependency approved by the maintainer on 2026-10-16). Scroll anchoring at the bottom, jump-to-message and RTL must keep working. |
| D9 | Typing in the composer re-renders only the composer, never the thread or the inbox. |
| D10 | First load after login: layout security checks run in parallel; `identity_touch_device` no longer blocks the response (fire-and-forget with error logging, or folded into the D2 RPC). |
| D11 | Every change is measured against a baseline taken before any other work (ticket 1). |

## Targets (from `.scratch/perf-loading/prompt.md`)

- Feedback on click ≤ 100 ms; switching between opened chats ≤ 150 ms; INP < 200 ms; LCP < 2.5 s; CLS < 0.05.
- First Load JS on /app routes at least 30% lower than `.scratch/perf-loading/build-before.txt`.
- Server time per /app navigation (`PULSE_PERF_TRACE=1`): at most one auth round trip plus the page's own data.

## Hard rules (from docs/agents/agent-brief.md)

RPC-only data access (no `.from()` in app code), `Result<T>`, i18n ar/en/fr, logical CSS properties, design tokens, reduced motion, no new npm deps other than D8, no Next major upgrade. Sub-agents never run git write commands; the coordinator commits. Each ticket = one PR, green CI before merge, before/after numbers in the PR body.

## Order

1 baseline → (2 region, 3 auth RPC, 7 locale split, 11 first load) in parallel → 4 store → 5 groups filter → (6 on-demand thread, 8 skeletons, 10 composer) → 9 virtualization (after 6).
