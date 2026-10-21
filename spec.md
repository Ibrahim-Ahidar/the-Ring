# Spec — Desktop Client (Electron) and Mobile Client (React Native)

Status: agreed in grilling session, 2026-10-20. Not started.
Vocabulary: see `CONTEXT.md` (Client, Device, Theme, Accent, Archived chat, Built-in filter, Folder).
Architecture decision: `docs/adr/0001-native-clients-thin-desktop-rpc-mobile.md`.

---

## 1. Goals

1. Ship a **Desktop Client** for Windows (and Linux through CI) that behaves like WhatsApp Desktop: it lives in the tray, shows native notifications and an unread badge, and auto-updates.
2. Ship a **Mobile Client** for Android with full feature parity with the Web Client, plus push notifications when the app is closed.
3. **Zero running cost.** Everything uses free tiers. The only paid item is the one-time $25 Google Play developer fee.
4. Lay groundwork for a later **local-first** model without building it now (§9).

### Non-goals (v1)

- iOS and macOS builds.
- Offline reading of chats, the offline send queue (pending messages with 🕓), local message storage.
- Web Push for the browser Web Client.
- Backup and restore (Google Drive etc.).
- Code-signing certificates.

---

## 2. Order of work

Each phase is one or more GitHub issues. A later phase is `blocked` by the earlier one.

| Phase | Deliverable | Blocked by |
|---|---|---|
| P0 | Monorepo migration (`apps/web`, npm workspaces) | — |
| P1 | Shared packages (`packages/core`, `packages/i18n`) | P0 |
| P2 | Desktop Client v1 (Windows) | P0 |
| P3 | Desktop release pipeline (GitHub Releases, auto-update, Linux AppImage) | P2 |
| P4 | Mobile Client scaffold + auth | P1 |
| P5 | Mobile core messaging | P4 |
| P6 | Mobile remaining feature parity | P5 |
| P7 | Device table + Android push pipeline | P4 (schema), P5 (to test end to end) |
| P8 | Android release (APK on GitHub Releases, then Play Store) | P6, P7 |

P2/P3 (desktop) and P1/P4+ (mobile) can run in parallel once P0 is merged, because they touch different folders.

---

## 3. P0 — Monorepo migration

### Target layout

```
/
├── package.json            # private root, "workspaces": ["apps/*", "packages/*"]
├── apps/
│   ├── web/                # current Next.js app, moved as-is
│   ├── desktop/            # Electron shell (P2)
│   └── mobile/             # Expo app (P4)
├── packages/
│   ├── core/               # shared types, zod schemas, RPC services (P1)
│   └── i18n/               # en/fr/ar message catalogs (P1)
├── supabase/               # stays at root (shared by every Client)
├── docs/, CONTEXT.md, spec.md
└── .github/workflows/
```

### Steps

1. `git mv` these into `apps/web/`: `src`, `e2e`, `tests`, `scripts`, `design`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `vercel.json`, and the current `package.json`, renamed to `@pulse/web`.
2. Create a root `package.json` with `workspaces` and pass-through scripts (`dev`, `build`, `test`, `lint`, `typecheck` → `npm run <x> -w @pulse/web`).
3. Regenerate `package-lock.json` at the root and delete the old `node_modules`.
4. Fix any paths in `scripts/gen-features.mjs`, the CI workflows (`ci.yml`, `e2e.yml`, `perf-nav.yml`) and Playwright config that assume the repo root.
5. **Vercel**: set the project's Root Directory to `apps/web` (a manual dashboard step for the user). Keep `regions: ["dub1"]`.
6. Supabase CLI still runs from the root, so `supabase/` is untouched.

### Acceptance

- `npm install` at the root works. `npm run build`, `npm test`, `npm run lint` and `npm run typecheck` pass from the root.
- CI is green and a Vercel preview deploy of the `dev` branch works.
- `git log --follow apps/web/src/...` still shows history.

---

## 4. P1 — Shared packages

### `packages/core` (`@pulse/core`)

Code that runs on both the web (Node and browser) and React Native. It must be **free of Next.js, DOM and Node-only APIs**.

Move here:
- `src/platform/result.ts`, `rpc.ts` (the `RpcClient` type + `callRpc`), `uuid.ts`, `pagination.ts`, `timeline.ts` (types and pure helpers), `username.ts`, `base64url.ts`, `limit.ts`, and any pure parts of `avatars.ts` / `media.ts`.
- Per feature: `types.ts`, the zod schemas, and `service.ts`, **as long as** the service only uses the `RpcClient` it is given. Check each one: `identity/service.ts` (878 lines) is the most likely to mix in server-only code; split it if so.
- Error codes (`platform.unauthenticated`, `notifications.*`, …) as a shared const union.

Stays in `apps/web`:
- `actions.ts` files (`"use server"`), `platform/session.ts`, `platform/supabase/*` (SSR cookies), `notify.ts` (service role), `middleware.ts`, telemetry, `perf-trace`, all React components.

Rules:
- `packages/core` has its own `tsconfig` and vitest config. Tests that move with the code move with it.
- Web imports `@pulse/core/...`. Update the `@/platform/...` imports with a codemod or a search-and-replace.
- The package is shipped as TypeScript source with `"main": "src/index.ts"`, and Next's `transpilePackages: ["@pulse/core", "@pulse/i18n"]` compiles it. Metro handles TS source natively.

### `packages/i18n` (`@pulse/i18n`)

- Move `src/shell/messages/{en,fr,ar}.json` here. Web keeps `next-intl` and imports the catalogs. Mobile uses `use-intl`, the framework-agnostic core of next-intl, so message keys and ICU formats are identical.
- Mobile-only strings live under a `mobile.*` namespace and desktop-only strings under `desktop.*`.

### Acceptance

- Web behaviour unchanged. All web unit and e2e tests pass.
- `packages/core` has no imports from `next`, `react-dom`, `server-only` or `node:*` (enforced by an ESLint `no-restricted-imports` rule).

---

## 5. P2/P3 — Desktop Client (Electron)

### Shape

A **thin shell**: one `BrowserWindow` loading the deployed Web Client. All UI and data come from the web. The shell adds only native features.

```
apps/desktop/
├── package.json        # electron, electron-builder, electron-updater
├── src/main.ts         # app lifecycle, window, tray, updater, IPC
├── src/preload.ts      # contextBridge → window.pulseDesktop
├── src/offline.html    # bundled offline screen
└── build/              # icons (.ico, .png)
```

### Main process behaviour

| Behaviour | Detail |
|---|---|
| URL | `PULSE_URL` env var, default the production URL. A dev script points at `http://localhost:3000`. |
| Single instance | `app.requestSingleInstanceLock()`; a second launch focuses the existing window. |
| Close button | Hides to the tray instead of quitting. Quit only from the tray menu ("Quit Pulse") or the app menu. The first time the window hides, a one-off notification says "Pulse is still running in the tray". |
| Tray | Icon, plus a menu with Open Pulse / Launch at login ☐ / Check for updates / Quit. Clicking the icon toggles the window. |
| Launch at login | `app.setLoginItemSettings`, **off by default**, toggled from the tray menu and stored in `electron-store` (or a JSON file in `userData`). |
| External links | `setWindowOpenHandler` + `will-navigate`: anything not on the Pulse origin opens in the system browser via `shell.openExternal`. |
| Window state | Remember size, position and maximised state between runs. |
| Offline | Listen for `did-fail-load` (network error codes) and load the bundled `offline.html` ("No connection — retrying…"). That page polls `navigator.onLine` plus a `HEAD` request to `PULSE_URL` every 5 s and reloads the app when it succeeds. |
| Security | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload exposes only the bridge below. Permission requests (microphone for voice notes, notifications) are allowed only for the Pulse origin. |
| Auth | Nothing special. Supabase SSR cookies persist in the default Electron session partition. |
| Auto-update | `electron-updater` against GitHub Releases. Checks on start and every 6 h, downloads in the background, then shows a "Restart to update" notification and tray item. |

### Preload bridge (`window.pulseDesktop`)

```ts
interface PulseDesktop {
  version: string;
  notify(n: { title: string; body: string; conversationId?: string; icon?: string }): void;
  setBadge(unreadCount: number): void;   // taskbar overlay icon on Windows, count on Linux
  focus(): void;
  onNotificationClick(cb: (conversationId: string) => void): () => void;
}
```

- Click on a notification → `focus()` the window, then send IPC to the renderer → the web navigates to `/app/chats/<conversationId>`.
- Windows: set `app.setAppUserModelId("com.pulse.desktop")` so notifications show correctly.

### Web Client changes (in `apps/web`)

- A small adapter, `src/platform/desktop.ts`: `isDesktop()` and typed access to `window.pulseDesktop`.
- **Notifications**: where the web currently reacts to incoming Realtime messages or notification rows, on Desktop and only when the window is hidden or unfocused, call `pulseDesktop.notify(...)`. Respect the existing mute, disabled and mentions-only preferences; reuse the same decision the `notify` RPC outcomes encode. Don't notify for the chat that's open and focused.
- **Badge**: push the total unread count (already shown as chat-list badges) to `setBadge` whenever it changes.
- Nothing else changes. With no bridge present, the Web Client behaves exactly as today.

### Build and release (P3)

- `electron-builder`: Windows target `nsis` (per-user install, no admin), Linux target `AppImage`. App id `com.pulse.desktop`, product name "Pulse".
- **Unsigned**. The README documents the SmartScreen "More info → Run anyway" step.
- GitHub Actions workflow `desktop-release.yml`: triggered by a tag `desktop-v*`, builds on `windows-latest` and `ubuntu-latest`, and publishes to a GitHub Release (with the `latest.yml` / `latest-linux.yml` files the updater needs).
- Versioning is independent of the web: `apps/desktop/package.json` version = tag.

### Acceptance

- The installer runs on Windows 10/11 without admin. The app opens on the production site and the user can log in, and stays logged in after a restart.
- Closing hides to the tray; a message from another account shows a native notification; clicking it opens that chat; the taskbar badge shows the unread count.
- Pulling the network cable shows the offline screen; plugging it back in reloads the app within ~5 s.
- Links to external sites open in the default browser.
- Publishing a new tag → a running older version offers "Restart to update".
- AppImage launches on Ubuntu.

---

## 6. P4–P6 — Mobile Client (Expo, Android)

### Stack

| Concern | Choice |
|---|---|
| Framework | Expo (latest SDK), TypeScript, **Expo Router** (file-based routes mirroring `/app/*` web routes) |
| Builds | `npx expo run:android` locally, or the EAS Build free tier. **No paid EAS plan.** |
| Backend | `@supabase/supabase-js`; session in `expo-secure-store` (chunked if > 2 KB) |
| Data layer | `apps/mobile/src/data/` — the **only** place that touches Supabase (see §9) |
| Server state | TanStack Query (cache, pagination, refetch on reconnect) |
| Realtime | Supabase Realtime channels, same topics and payloads as `src/platform/realtime*.ts` on the web |
| Lists | `@shopify/flash-list` for the chat list and message timeline (inverted) |
| i18n | `use-intl` + `@pulse/i18n`; `I18nManager.forceRTL` for Arabic |
| Media | `expo-image-picker`, `expo-image`, `expo-audio` (record + play voice notes), `expo-file-system` for uploads |
| Push | `expo-notifications` + FCM (free) through Expo's push service (free) |
| Network | `@react-native-community/netinfo` |
| Theming | Theme (System/Light/Dark) + Accent (Indigo/Green) tokens ported from the web CSS tokens into a TS theme object |

### Auth (P4)

- Email + password sign-up and login (`signUp`, `signInWithPassword`), the same Supabase project as the web.
- **6-digit codes, not links**, for email confirmation and password reset (`verifyOtp` with type `signup` / `recovery`). The Supabase email templates (`supabase/templates/`) must include `{{ .Token }}`. Check that the web flows still work if a template changes; if the web relies on links, include both the link and the code in one template.
- Username step after sign-up (same rules as the web `username` route, using the shared `@pulse/core` validators).
- Sign-out: deletes this Device's push token row (§7), clears the TanStack Query cache, then calls `supabase.auth.signOut()`.

### Data-access layer

`apps/mobile/src/data/` exposes plain async functions and subscriptions per feature, e.g. `conversations.list(filter)`, `messages.list(conversationId, cursor)`, `messages.sendText({conversationId, clientId, body, replyToId})`, `messages.subscribe(conversationId, handler)`.

- Each one calls the shared `@pulse/core` service with a mobile `RpcClient` built from the Supabase client.
- Screens and hooks import **only** from `src/data/`, never `supabase` directly. An ESLint rule enforces this.
- If a web server action does logic beyond calling the RPC (validation, multi-step writes, storage signing, notify calls), that logic moves **into a Postgres function** (new migration) or into `@pulse/core`, so web and mobile share it. Audit all 11 `actions.ts` files at the start of P5 and list the findings in the P5 issue.

### Feature parity (P5 core, P6 rest)

Everything the Web Client has, grouped by `src/features/*`:

| Feature | Mobile v1 scope | Phase |
|---|---|---|
| identity | sign-up, login, OTP verify, password reset, username, profile view and edit, avatar upload, sign-out | P4 |
| direct-messaging | chat list, open direct chat, timeline with pagination, open at first unread, send text, replies, delivered and read ticks | P5 |
| typing-presence | typing indicator, online/last seen | P5 |
| media | send and view images, record, send and play voice notes (mic badge grey until played, same as the web) | P5 |
| reactions | add, remove and view reactions | P5 |
| message-actions | long-press menu: reply, copy, delete, etc. — parity with the web menu | P5 |
| groups | create group, group info, members, admin actions | P6 |
| message-requests | requests inbox, accept, decline | P6 |
| safety | block, unblock, report | P6 |
| conversation-organization | Archived chats, Built-in filters, Folders (create, order, assign) | P6 |
| discovery-contacts | find by username, add contact | P6 |
| locale-appearance | Theme, Accent, language (en/fr/ar), synced through the existing `appearance_update_*` RPCs | P6 |

UX conventions, close to WhatsApp Android: a bottom tab or top tab for Chats / Groups / Contacts / Settings that mirrors the web shell; swipe actions on chat rows where the web has the equivalent action; long-press for the message menu; Android back closes sheets before navigating back.

### Offline behaviour (v1)

- NetInfo drives a "Waiting for network…" banner at the top of every screen.
- Whatever is already loaded stays visible (the TanStack Query in-memory cache). Nothing is saved to disk.
- The send button and composer actions are disabled while offline. Typed text stays in the draft.
- On reconnect: refetch the open queries and resubscribe the Realtime channels.

### RTL

- When the language changes to or from Arabic, call `I18nManager.allowRTL` / `forceRTL` and show a "Restart to apply" prompt that uses `expo-updates`' `reloadAsync()`.
- Use `start`/`end` styles everywhere, never `left`/`right`. Mirror icons that imply direction.

### Acceptance (per phase)

- **P4**: install a debug APK on a real Android phone; sign up with a 6-digit code; log in; reset the password with a code; the session survives an app restart; sign out.
- **P5**: two accounts (web + mobile) chat in real time both ways: text, image, voice note, reply, reaction, typing indicator and ticks all reflect within ~1 s. Opening a chat lands on the first unread message.
- **P6**: every row of the parity table works on mobile and its effect is visible on the web; Arabic flips the layout after a restart; Theme and Accent follow the account across Clients.
- **Always**: no Supabase import outside `src/data/`; unit tests for `src/data/` with a mocked `RpcClient`.

---

## 7. P7 — Devices and Android push

### Schema (new migration)

```sql
create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client      text not null check (client in ('desktop','mobile')),
  platform    text not null,              -- 'android', 'windows', 'linux'
  push_token  text unique,                -- Expo push token, null for desktop
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
-- RLS: a user can select, insert, update and delete only rows where user_id = auth.uid().
```

Plus RPCs `register_device(p_client, p_platform, p_push_token, p_app_version) returns uuid` (upsert on `push_token`, reassigning the row to the current user if the token moved accounts) and `unregister_device(p_device_id)`.

### Flow

1. Mobile, after login: request notification permission (Android 13+ `POST_NOTIFICATIONS`), call `getExpoPushTokenAsync`, then `register_device`. Re-register on every app start (refreshes `last_seen_at` and `app_version`) and on token change.
2. A row is inserted into the notifications table (by the existing `public.notify(...)` path, which already applies the disabled, muted and mentions-only preferences).
3. A **Supabase Database Webhook** on `INSERT` into the notifications table calls the Edge Function `push-notify`.
4. `push-notify` (Deno, Supabase free tier):
   - loads the recipient's `devices` with a non-null `push_token`;
   - builds the message: the sender's display name as the title; the message preview as the body ("📷 Photo", "🎤 Voice message" for media); `data: { conversationId, notificationId }`; Android `channelId` "messages";
   - POSTs a batch to `https://exp.host/--/api/v2/push/send`;
   - deletes devices whose receipts say `DeviceNotRegistered`.
   - It authenticates the webhook with a shared secret header kept in Supabase secrets.
5. Mobile: tapping a notification deep-links into the chat with Expo Router. While the app is in the foreground, notifications for the chat that's open are suppressed by the `setNotificationHandler` handler; other chats show a heads-up.
6. Collapsing: use the conversation id as the Android notification tag so several messages from one chat stack into one notification.

### Firebase setup (manual, free)

- Create a Firebase project, add an Android app with package `com.pulse.mobile`, and download `google-services.json` to `apps/mobile/`. Keep it **out of git**: commit an example file, and in CI write it from a GitHub secret.
- Upload the FCM v1 service-account key to Expo (`eas credentials`) so Expo's push service can reach FCM.

### Acceptance

- With the app killed, a message from another account shows an Android notification within a few seconds; tapping it opens that chat.
- A muted chat sends no push; mentions-only sends a push only for mentions.
- Signing out stops pushes to that phone; signing in as a different user on the same phone moves the Device to them.
- An uninstalled app's token is removed after the first failed push.

---

## 8. P8 — Android release

1. **APK on GitHub Releases** (immediately):
   - Release keystore generated locally. **Back it up** — losing it means users can't update. It's stored as GitHub secrets (base64 keystore + passwords), never in git.
   - Workflow `mobile-release.yml` on tag `mobile-v*`: `expo prebuild` then Gradle `assembleRelease`, signed, and the APK attached to the release.
   - In-app update notice: on start, compare `app_version` against the latest `mobile-v*` release from the GitHub API and show "Update available" with a link.
2. **Play Store** (when ready, $25 one-time):
   - Build an AAB (`bundleRelease`) and enrol in Play App Signing.
   - New personal developer accounts must run a **closed test with at least 12 testers for 14 continuous days** before production access. Plan for this.
   - Needs a privacy policy URL (the web `legal` route can host it), the Data safety form (email, messages, photos, audio, device IDs for push), and content rating.
   - Once Play Store builds exist, the in-app notice points there instead.

---

## 9. Later: local-first (not in v1)

The direction agreed for after v1:
- The **Mobile Client becomes the primary Device**. Messages are stored on the phone (SQLite), like WhatsApp.
- A **backup** goes to the user's own cloud storage (e.g. Google Drive).
- The **Desktop Client** logs in and gets recent chats from that backup or live from the online phone.
- Offline: reading works fully; sending queues as a **pending message** (🕓) and goes out on reconnect, using the existing `clientId` so retries can't send duplicates.

What v1 does now to keep that cheap:
- All Mobile data access goes through `src/data/` (§6). Later, that layer swaps to read and write local SQLite and sync, without touching screens.
- Messages already carry a client-generated `clientId`. Keep it on every new write RPC.
- RPC changes stay additive (ADR 0001), so older installed Mobile builds keep working.

This will need its own grilling session and ADR. It changes where the source of truth lives.

---

## 10. Cross-cutting rules

- **Compatibility**: installed Mobile and Desktop builds lag behind the web. Never rename, remove or change the meaning of an RPC's parameters or return shape; add a new RPC or a new optional parameter instead. Add a `min_supported_mobile_version` value (a row in a config table or a `get_client_config` RPC). Mobile checks it on start and shows a blocking "Please update" screen when it's too old.
- **Costs**: Supabase free tier (`push-notify` is the first Edge Function; check free-tier invocation limits), Expo push (free), FCM (free), EAS Build free tier or local builds, GitHub Actions free minutes for public repos and the private quota otherwise. Nothing may introduce a paid service.
- **Secrets**: `google-services.json`, the FCM service-account key, the Android keystore and the push webhook secret are never committed. They live in GitHub Actions secrets, Expo credentials and Supabase secrets.
- **Git**: all work on branch `dev`, one issue per phase (or smaller), each worker stages only its own files.
- **Testing**: `packages/core` unit tests (vitest); mobile `src/data/` unit tests (jest-expo); desktop smoke-tested by hand from the acceptance lists above; web e2e stays green after P0, P1 and the P2 web adapter.

---

## 11. Manual steps for the user (cannot be automated)

1. Vercel dashboard: Root Directory → `apps/web` (P0).
2. Create the Firebase project and download `google-services.json` (P7).
3. Create an Expo account and upload the FCM key with `eas credentials` (P7).
4. Generate and **back up** the Android release keystore; add it to GitHub secrets (P8).
5. Pay the $25 Play Console fee, recruit 12 closed testers, fill in the store listing (P8, when ready).
6. Update the Supabase auth email templates to include the 6-digit `{{ .Token }}` (P4).
