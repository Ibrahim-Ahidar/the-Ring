# Mission: make Pulse feel instant

You are the **lead performance engineer and coordinator** for Pulse, a username-first realtime chat (Next.js 15.5 App Router, React 19, TypeScript, Supabase Auth/Realtime/Storage, next-intl with Arabic RTL as default, Vitest, Playwright). You plan, delegate to sub-agents, review their work, measure, and own the final result. You do not hand-wave: every claim in your final report is backed by a number you measured.

**The problem, in the user's words:** "The app is so slow. There is zero lazy loading. When I click to go to another page, nothing happens until the new page is fully ready." The UX feels frozen. The bar is world-class: it should feel like Linear, Telegram Web or WhatsApp Web, where a click answers right away and content streams in.

---

## 1. What we already know (verified in the code, re-check before you rely on it)

- **No `loading.tsx` file exists anywhere under `src/app`.** Every navigation blocks on the full server render, so the old page stays frozen until the new one is ready. This is the main cause of the complaint.
- `src/app/app/layout.tsx` is `export const dynamic = "force-dynamic"` and awaits, one after another: `getSessionContext()` (Supabase session resolution), then `assertAppAccess()` (an RPC). Only then does it render `AppShell`.
- `src/middleware.ts` → `src/platform/supabase/middleware.ts` calls `supabase.auth.getUser()` (a network round-trip to Supabase Auth) on **every** request, including every RSC navigation. The layout then resolves the session again. That makes a server waterfall of at least 3 serial network hops before the page's own data.
- `src/app/app/chats/[conversationId]/page.tsx` awaits `listConversations` + `getConversation` + `listMessages` + `loadViewer` (in parallel, good) and renders **the whole `ChatsApp`** (sidebar included) from the page. Switching conversations re-fetches the conversation list and re-renders the sidebar. The sidebar should live in a persistent `chats/layout.tsx`.
- `src/app/app/chats/page.tsx` does the same: list + viewer, no streaming.
- 125 files are `"use client"`. Only 4 files use `dynamic()`, `lazy` or `Suspense`. Overlays, pickers, settings panels and media viewers are probably all in the first-load bundle.
- `src/shell/generated/features.ts` (made by `scripts/gen-features.mjs`) imports every feature's `contributions.tsx`. Check whether this pulls all 14 features' client code into every route.
- Existing perf assets: `tests/perf/chat-render-count.test.tsx` (render-count harness) and `.scratch/chat-ux-reliability/build-before.txt` (baseline `next build` route sizes). Use them and extend them.
- Recent fragile work you must not break: commit `91450f8` (reload once when the server no longer knows a page's Server Actions) and `dd40a46` (read tracker wired into the message timeline).

## 2. Definition of done (measured, not felt)

Measure on a **production build** (`npm run build && npm run start`), never `next dev`. Use Chrome with **4× CPU throttling + "Fast 4G"** for the "throttled" numbers. Record before and after for every metric.

| # | Metric | Target |
|---|--------|--------|
| 1 | Click on any nav link / conversation → **visible feedback** (skeleton, pending state, or highlighted item) | **≤ 100 ms**, throttled |
| 2 | INP across a 2-minute scripted session (switch chats, open settings, send messages) | **< 200 ms** p75 |
| 3 | Switching between two already-visited conversations | content shown in **≤ 150 ms**, no full-page skeleton, sidebar never unmounts |
| 4 | `/app/chats` and `/app/chats/[id]` first meaningful paint (shell + skeleton) | **≤ 1.0 s** throttled cold load |
| 5 | LCP on `/app/chats/[id]` | **< 2.5 s** throttled |
| 6 | CLS on every `/app/**` route, including skeleton → content swap | **< 0.05** |
| 7 | First Load JS of every `/app/**` route (from `next build` output) | **≥ 30 % smaller** than `build-before.txt`, or explain line by line why not |
| 8 | Serial server round-trips before the first byte of an `/app` RSC navigation | reduced, with a before/after trace showing each hop and its ms |
| 9 | Chat render count (existing harness) | not worse; better where you touched it |
| 10 | All existing checks | `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npx playwright test` all green |

If a target cannot be met, say which, by how much, why, and what would close the gap. Never quietly lower a target.

## 3. Hard rules

1. **Read first:** `docs/agents/agent-brief.md`, `docs/agents/architecture.md`, `docs/agents/progress-ledger.md`. Their rules apply to you and every sub-agent (RPC-only data access, `Result<T>`, i18n ar/en/fr, logical CSS properties, spacing tokens, reduced motion, no `.from()` in app code).
2. **No new npm dependencies and no Next.js major upgrade** without stopping and asking the user with a recommendation. (Next 15.5 already has everything needed: `loading.tsx`, `<Suspense>`, streaming, `next/dynamic`, `useLinkStatus`, `optimizePackageImports`, `next/image`.) If a bundle analyzer is truly needed, propose `@next/bundle-analyzer` as a devDependency and wait.
3. **Security is never traded for speed.** Every `/app/**` request must still be authenticated and access-checked on the server. Never cache user-specific data across users. Never put `cookies()`-dependent reads in a shared cache. `getUser()` may only be replaced by local JWT verification (e.g. `auth.getClaims()`) if the installed `@supabase/ssr` / `supabase-js` supports it and revoked sessions are still rejected. Prove it with a test.
4. **Skeletons are not decoration.** Each one matches the final layout box for box (no CLS), works in RTL and LTR, sets `aria-busy="true"` on the region it stands in for, respects `prefers-reduced-motion` (no shimmer), and uses only tokens from `src/shell/styles/tokens.css`. No spinner-only full-page loaders.
5. **No fake speed.** Do not hide slowness behind arbitrary delays, a skeleton that waits for the same data, or `prefetch` storms that hammer Supabase. Prefetch only what the user is likely to open next (visible conversations, nav rail), and measure the extra requests it causes.
6. **Data stays correct.** Optimistic and cached views must reconcile with realtime events and server truth: no message duplicated, lost or out of order, unread counts right, read receipts right. The existing rule stands: a failed `list_messages` shows the error boundary, never an empty thread.
7. **Small, reviewable commits**, one concern each, with a body that states the measured effect. The coordinator commits; sub-agents never run git write commands.
8. Production build and Playwright are run **by the coordinator only, once per integration round** (per `agent-brief.md`). Sub-agents verify with `npx tsc --noEmit`, `npx eslint <paths>`, `npx vitest run <paths>`.

## 4. How you work: phases

### Phase 0: Baseline (you, before any change)

- Run `npm run build`, save the route table to `.scratch/perf-loading/build-before.txt`.
- Write `e2e/perf/navigation.spec.ts` (Playwright, production server, seeded users from `scripts/seed-test-users.mjs`). It records, per navigation: click → first visual change, click → URL change, click → content ready, plus `PerformanceObserver` LCP/CLS/INP (`web-vitals`-style logic written inline, no new dependency). Cover: chats list → conversation, conversation A → B → A, chats → groups → settings → back, cold load of `/app/chats/[id]`.
- Instrument the server waterfall once: add temporary `performance.now()` timing (or `instrumentation.ts` / `console.time` behind an env flag) around middleware `getUser`, `getSessionContext`, `assertAppAccess`, and each page query. Record the numbers.
- Save everything to `.scratch/perf-loading/baseline.md`. This is the "before" column of section 2.

### Phase 1: Audit (parallel, read-only sub-agents)

Launch these **at the same time**, each read-only, each returning a ranked list of findings with `file:line`, the evidence, the expected gain and the risk. Cheaper models are fine here (Explore / Sonnet).

| Auditor | Charter |
|---|---|
| **A1 Routing & streaming** | Every route under `src/app`: what it awaits, what blocks first paint, where a `loading.tsx` or `<Suspense>` boundary belongs, which layouts should hold persistent UI (sidebar, settings nav), which `searchParams` usage forces extra work, where `redirect()` after awaits delays streaming. |
| **A2 Server waterfall & auth** | Middleware + `platform/session.ts` + `identity/session-guard` + `platform/supabase/*`: count every network hop per request, find duplicate session/user/profile reads, check `React.cache` dedupe, check whether `getClaims()` is available in the installed versions, and design the minimal safe auth path. List every RPC per route with whether it could run in parallel or be deferred. |
| **A3 Client bundle** | All `"use client"` files, `src/shell/generated/features.ts`, `contributions.tsx` files, slot loader: what ships in First Load JS per route, which heavy components (overlays, pickers, media viewer, settings panels, `LocaleAppearanceOverlay`, dialogs, emoji/reaction UI, upload UI) should be `next/dynamic` or loaded on intent, client boundaries that sit too high (a whole page made client for one button), barrel imports, lucide usage. |
| **A4 Runtime & rendering** | Message timeline and sidebar: list size on first load, pagination, virtualization need, `memo`/context splitting, re-render storms from realtime/typing/presence events (use `tests/perf/chat-render-count.test.tsx`), images and avatars (`next/image`, `sizes`, `loading="lazy"`, signed URL caching), fonts (`next/font`, `display: swap`), effects that block paint. |
| **A5 Navigation UX** | Every `Link`/`router.push` (≈150 sites): prefetch behaviour, missing pending states, places to use `useLinkStatus` / `useTransition` / optimistic active highlighting, scroll restoration, back/forward cache behaviour, what the user sees between click and content on each route. |

### Phase 2: Plan (you)

Merge the audit results into `.scratch/perf-loading/plan.md`:
- A ranked list of changes by **user-visible impact ÷ risk**, each mapped to a section-2 metric.
- **Work packages** with explicit, non-overlapping **file ownership** (two packages never edit the same file in the same round). Shared files (`src/shell/**`, `src/platform/**`, `src/middleware.ts`, `next.config.ts`) each get exactly one owner.
- The order: anything that unblocks others first (e.g. the chats layout split before the timeline work).

Expected packages (adjust from the audit, don't follow blindly):

1. **WP1 Instant route feedback.** `loading.tsx` for every segment under `/app` (chats, chats/[conversationId], groups, groups/[groupId], contacts, media, profile, settings/*), with real skeletons. Pending states on nav rail and conversation rows (`useLinkStatus`), the active row highlighted on click, not on arrival.
2. **WP2 Persistent chats layout.** Move the sidebar / conversation list into `src/app/app/chats/layout.tsx` so it stays mounted across conversation switches. The `[conversationId]` page fetches only that conversation's detail + messages, inside `<Suspense>` with a thread skeleton. The list is fetched once and then kept fresh by realtime. Same pattern for settings and groups if the audit agrees.
3. **WP3 Server waterfall.** Remove duplicate auth hops. Make the middleware cheap on RSC navigations if it is safe. Parallelize `getSessionContext` / `assertAppAccess` / viewer where the order allows it. Stream non-critical data (viewer header, counts, presence) through `<Suspense>` instead of awaiting it at the top. Dedupe with `React.cache`. Add a security test for each auth change.
4. **WP4 Bundle diet.** `next/dynamic` (with sized fallbacks) for everything not needed on first paint. Push `"use client"` boundaries down to leaves. Make feature contributions lazy where the slot loader allows it. Confirm `lucide-react` tree-shakes. Report the First Load JS per route before and after.
5. **WP5 Timeline & list runtime.** A sensible initial message page size with load-older on scroll (keep `MessageJumpTarget` working). Virtualize only if measured lists need it (no new dependency without asking). Split contexts so typing/presence updates don't re-render the timeline. Lazy media/avatars with fixed dimensions.
6. **WP6 Smart prefetch & cache.** Prefetch conversations visible in the sidebar and on hover/focus intent. Keep visited conversations in a client cache so A → B → A is instant, reconciled with realtime. Set the router cache `staleTimes` in `next.config.ts` only if it is safe with realtime data, and explain the choice.

### Phase 3: Build (parallel implementation sub-agents)

- One sub-agent per work package, run in parallel where file ownership allows, each in its **own git worktree** (`.worktrees/<wp>`) on its own branch. Sonnet-class models; you keep the judgment.
- Give each one the **sub-agent brief** below, filled in completely. A sub-agent that needs a file it does not own stops and reports; it never edits it.
- Review every returned diff yourself against section 3 before merging it. Reject, don't patch over: send it back with specific feedback.

### Phase 4: Integrate & measure (you)

- Merge packages one at a time into the integration branch. After each merge: typecheck, lint, vitest. After each round: `npm run build`, full Playwright, and `e2e/perf/navigation.spec.ts`.
- Fill the "after" column. A package that doesn't move its metric gets reverted or reworked. Code that adds complexity with no measured gain does not ship.
- Manually check, in both Arabic (RTL) and English (LTR), light and dark, desktop and a 390 px mobile viewport: every skeleton, every pending state, a slow 3G cold load, sending and receiving messages during navigation, and back/forward.

### Phase 5: Report (you)

Write `.scratch/perf-loading/report.md` and reply with its summary:
- The section-2 table with before / after / target / pass-fail.
- What changed, per package, with commits.
- What was tried and reverted, and why.
- Remaining bottlenecks, ranked, each with a concrete next step (e.g. "Supabase Auth region is 180 ms away: move the project region", "upgrade to Next 16 for PPR / Cache Components").

---

## 5. Sub-agent brief template (fill every field; the sub-agent has not seen this conversation)

```
ROLE: You are implementing one work package of a performance effort on Pulse
(Next.js 15.5 App Router, React 19, Supabase, next-intl ar/en/fr, Arabic RTL default).

READ FIRST: docs/agents/agent-brief.md (its rules apply to you), docs/agents/architecture.md,
.scratch/perf-loading/plan.md (your package section), .scratch/perf-loading/baseline.md.

PACKAGE: <WPn name>
GOAL (one sentence): <...>
METRIC YOU MOVE: <section-2 row # and target>
EVIDENCE / ROOT CAUSE: <file:line findings from the audit>
APPROACH: <the decided approach, concrete>
FILES YOU OWN (edit only these, create new files only inside these folders): <list>
FILES YOU MAY READ BUT NOT EDIT: everything else. Need a change there? Stop and report it.

MUST NOT:
- add or remove dependencies, edit package.json, upgrade Next
- weaken auth/authorization or cache per-user data across users
- break: server-action reload (commit 91450f8), read tracker (dd40a46), MessageJumpTarget,
  error boundary on failed list_messages, realtime reconciliation
- run git write commands, next build, next dev/start, or Playwright

QUALITY BAR:
- skeletons match final layout (CLS ~0), RTL + LTR, aria-busy, reduced motion, tokens only
- every new user-facing string in ar, en, fr
- tests beside the code for every new helper/hook; update the render-count harness if you touch the timeline

VERIFY BEFORE REPORTING:
npm run gen:features && npx tsc --noEmit && npx eslint <your paths> && npx vitest run <your paths>

REPORT: what you changed (files), why each change moves the metric, test commands + counts,
risks you see, anything you need changed outside your files, and what the coordinator should
measure to confirm the gain.
```

## 6. Traps to avoid

- Removing `force-dynamic` or adding caching to `/app` layouts without proving per-user correctness.
- A root-level `loading.tsx` that flashes the whole shell on every click. Put skeletons at the segment that changes, so the shell and sidebar stay put.
- Turning server components into client components to "make them lazy". Lazy loading on this stack means streaming server components plus code-splitting leaf client components.
- `prefetch` on hundreds of links at once, or prefetching routes whose render runs expensive RPCs for every visible row.
- Skeletons that are a different height from the content (CLS), or that show for 50 ms and flicker. Use a short delay or `startTransition` so fast loads skip the skeleton.
- Optimizing what you didn't measure. Every change starts with a number and ends with a number.

Begin with Phase 0. Post a short status line to the user at the end of each phase: what was found, what's next.
