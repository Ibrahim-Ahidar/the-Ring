# UI refresh: indigo accent, accent setting, micro-animations, long-press

**Status:** ready-for-agent

**Touches:** `src/shell/styles/tokens.css`, `src/shell/styles/ui.module.css`, `src/shell/styles/shell.css`, `src/shell/locale.ts`, `src/app/layout.tsx`, `src/features/locale-appearance` (settings UI, actions, service, context, messages), `src/features/direct-messaging` (ConversationList, MessageActionHost, message timeline, direct-messaging.module.css), `src/features/conversation-organization` (reuse long-press + sheet pattern), a new Supabase migration for `profiles.accent`.

## Problem

The app's brand colour is WhatsApp green (`--color-accent: #1daa61`) on warm beige neutrals, while the app icon (`src/app/icon.svg`) is indigo `#4f46e5`. The UI feels like a WhatsApp clone, not this product. Interactions are flat: the chat-row action buttons (`.rowMenu`) fade in *on top of* the pin / mute / unread badge instead of making room, and the message ⋯ trigger only toggles opacity. On touch screens the row buttons are always visible and there is no long-press on chat rows or messages.

## Decisions (agreed with the user)

### Colour

1. **Indigo is the new default Accent**, matching the icon: `#4f46e5` in light, a lighter indigo (≈ `#818cf8`) in dark. Accent tokens: `--color-accent`, `--color-accent-strong`, `--color-accent-soft`, `--color-accent-contrast`, `--color-focus` — all derived from indigo with AA contrast for text/icons on them.
2. **The Indigo Accent is a full palette, not just a button colour:**
   - Sent bubble (`--color-bubble-out`): pale indigo in light, deep indigo in dark.
   - Neutrals switch from warm beige to cool greys: `--color-bg`, `--color-panel`, `--color-input`, `--color-hover`, `--color-selected`, `--color-chat-bg`, `--color-chat-pattern`, borders.
   - Dark surfaces get a *very slight* cool tint (≈ `#121318` / `#17181d`), not a navy theme.
3. **Green Accent = "Classic"**: exactly today's look (green accent, green sent bubbles, warm beige neutrals, current dark greys). Today's token values are kept verbatim as the Green palette.
4. **Non-accent colours:**
   - Online dot stays green (`--color-online`) in both Accents.
   - Read ticks: sky blue (≈ `#0ea5e9` light / `#38bdf8` dark) under Indigo so they stay distinct from the accent; Green keeps today's `#007bfc` / `#53bdeb`.
   - Group sender names (`--sender-*`) and avatar fallbacks (`--avatar-*`) keep their palettes; only verify contrast against the new neutrals and nudge if any fails AA.
   - Media file-type colours in `media.module.css` are left alone.
5. **Theme (System / Light / Dark) already exists** (enum `profile_theme`, cookie, default `system`) — no behaviour change. Its preview cards in `locale-appearance.module.css` hardcode beige hexes; make them follow the active Accent's neutrals.

### Accent setting

6. **New user setting "Accent color": Indigo (default) / Green.** Independent of Theme (3 × 2 combinations).
7. **Persisted exactly like Theme:** new enum `profile_accent ('indigo','green')`, column `profiles.accent not null default 'indigo'`, RPC `appearance_update_accent(p_accent text)` (same shape/validation as `appearance_update_theme`), server action `saveAccentAction`, cookie, `ACCENTS` / `isAccent` in `src/shell/locale.ts`, `data-accent` on `<html>` rendered by the server in `layout.tsx` so there is no colour flash on load.
8. **Settings UI:** in Appearance, a second radiogroup under Theme, "Accent color", with two swatch cards (Indigo, Green) styled like the theme cards. Change applies instantly (set `data-accent` client-side), saved via the existing `usePreferenceSave` pattern.
9. **Tokens structure:** `:root` holds the Indigo palette (default); `[data-accent="green"]` overrides with the Classic palette. Every colour stays a `light-dark()` pair.
10. Update the PWA/metadata `themeColor` in `layout.tsx` to indigo.

### Motion (all use existing `--motion-*` tokens and `--motion-ease`; reduced-motion already zeroes durations — additionally disable transforms/keyframes under `prefers-reduced-motion: reduce`)

11. **Chat-row hover (desktop / `hover: hover` only):** the row menu moves *into the row layout* (no longer an absolute overlay on the meta). On hover / focus-within, the meta items (pin, mute, unread badge) shift ~4–6 px toward the start and the menu fades + slides in from the end edge beside them; reverses on leave. 180 ms (`--motion-medium`). Logical properties only so RTL (Arabic) mirrors automatically. The row must not change height or reflow the name/preview text abruptly — reserve or animate the space smoothly.
12. **Message ⋯ trigger (desktop):** fade + small slide in on bubble hover/focus instead of opacity only.
13. **Folder / filter chips:** background and colour transitions on hover and on active change.
14. **Buttons and icon buttons** (`ui.module.css`): hover background transition + subtle press scale (`scale(0.96)` on `:active`).
15. **Menus, popovers, modals, bottom sheets:** open with fade + 4 px rise (menus/popovers) or scale from 0.98 (modals); sheets slide up from the bottom.
16. **Unread badge pop:** a short scale pop when the badge first appears (0 → n) **and when the count increases**; no animation on decrease. Muted badge animates the same.
17. **New message fade-up:** only for messages that arrive live (realtime insert or just sent by the user). Never on initial thread load, older-history pagination, or virtualized rows remounting while scrolling (`@tanstack/react-virtual`).
18. **Out of scope:** mobile sidebar ↔ thread slide transition.

### Touch screens & long-press

19. **No hover-slide animations on touch** (`@media (hover: none)`): the inline row menu buttons and the message ⋯ trigger are **hidden** on touch.
20. **Chat row long-press (~500 ms)** opens a bottom sheet with that chat's actions (the same list `availableMenus` renders today: pin, mute, archive, etc.). Reuse the FolderStrip long-press pattern (`FolderStrip.tsx` press timer, cancel on move/scroll) and the `FolderMenuSheet` bottom-sheet / focus-trap pattern.
21. **Message bubble long-press** opens the existing message action menu (`MessageActionHost`).
22. **Desktop / keyboard parity:** right-click, the ContextMenu key and Shift+F10 open the same menus on rows and bubbles. Long-press must not fire while scrolling and must suppress the native context menu / text-selection callout and the link navigation that would follow.
23. Non-hover animations (press scale, menu/sheet open, badge pop, new-message fade-up) **stay on touch**.

## Implementation notes

- Grep for hardcoded colours outside `tokens.css` (12 today) and convert any that are theme surfaces to tokens; leave media file-type colours.
- `design/css/tokens.css` has a prototype `[data-accent="blue"]` block — use as a structural reference only; the values here (indigo `#4f46e5`) win.
- `.rowMenu` currently `position: absolute` over the row (`direct-messaging.module.css` ~line 107). Moving it into flow means it sits beside `.chatRowMeta`; keep the menu a sibling of the `<Link>` (never inside the anchor) — use a grid/flex wrapper on `.chatItem` or keep absolute positioning but translate `.chatRowMeta` on `.chatItem:hover`. Either is fine as long as decision 11 holds.
- Badge pop needs the previous count: track it per row (ref or `data-` attribute + `key` trick) without re-rendering the whole list — `tests/perf/chat-render-count.test.tsx` must still pass.
- New-message "live" flag: set it where realtime inserts / optimistic sends enter the store, not in the render path.
- i18n: add keys in `ar`, `en`, `fr` for "Accent color", "Indigo", "Green" and any new sheet labels.
- Update `CONTEXT.md` (already done: **Theme**, **Accent**).

## Tests

- SQL/service: `appearance_update_accent` accepts `indigo`/`green`, rejects others; default is `indigo`.
- Action: `saveAccentAction` validates, calls RPC, sets cookie.
- Layout: `<html>` renders `data-accent` from cookie/profile; falls back to `indigo`.
- Settings component: Accent radiogroup renders two options, reflects state, saves on change.
- ConversationList: long-press (fake timers) opens the actions sheet; moving/scrolling cancels; right-click and Shift+F10 open it; row menu buttons not rendered/visible on touch (or hidden via CSS — assert the sheet path works).
- Message bubble: long-press / context-menu opens the message action menu.
- Badge: pop class/attribute applied on 0→n and on increase, not on decrease.
- Timeline: live-inserted message gets the enter animation marker; initially loaded and paginated messages do not.
- Perf: `chat-render-count` stays green.

## Done when

`npm run typecheck`, `npm run lint`, and `npm test` pass; the migration applies cleanly on local Supabase; manual check of Indigo/Green × Light/Dark/System in LTR and RTL, with reduced-motion on and off, on desktop and a touch viewport.

## Glossary (in CONTEXT.md)

- **Theme:** System (default) / Light / Dark.
- **Accent:** Indigo (default, matches the icon) / Green (classic look); sets brand colour, sent bubbles and neutrals together.
