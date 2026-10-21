# @pulse/mobile

Expo Router Android client for the Ring (spec section 6, ADR 0001). This ticket covers login, logout and a session kept in secure storage; the rest of the Mobile Client comes in later tickets.

## Layout

- `app/` Expo Router routes: `(auth)/login` for signed-out users, `(app)/` for signed-in users. `src/auth/gate.ts` decides the redirect.
- `src/data/` the only place that imports `@supabase/*` (enforced by ESLint). Screens import from `@/data`.
- `src/data/secure-storage.ts` Supabase session storage on `expo-secure-store`, chunked below SecureStore's 2048-byte limit.
- Strings come from `@pulse/i18n`; mobile-only strings live under the `mobile.*` namespace.

## Setup

From the repo root run `npm install` (npm workspaces). Then:

```
cd apps/mobile
cp .env.example .env     # fill in the same Supabase URL and anon key as apps/web
```

Variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never commit real values.

## Run

- Expo Go on a phone or emulator: `npm run start`, then scan the QR code (or press `a` for an emulator). Expo Go must match SDK 58.
- Dev build (needed for features Expo Go lacks): `npx expo run:android` with Android Studio and an emulator, or a USB-connected device with debugging on.
- Android emulator on the same machine reaches a local Supabase at `http://10.0.2.2:54321`.

## Scripts

`npm run start`, `android`, `test` (jest-expo), `typecheck`, `lint`.

## React versions

Expo SDK 58 uses React 19.3.0, the same as apps/web, so a single hoisted copy serves both and nothing needs `nohoist`. If the versions diverge later, install the mobile app's React in `apps/mobile/node_modules` and keep Metro's `nodeModulesPaths` order (app first).

## Push notifications (manual setup)

Pushes go: new message -> `notifications` insert -> DB trigger (pg_net) -> Edge Function `push-notify` -> Expo push -> FCM. Nothing below is committed.

1. Firebase: create a project, add an Android app with package `com.pulse.mobile`, download `google-services.json` into `apps/mobile/` (keep it out of git; write it from a CI secret for builds).
2. Upload the FCM v1 service-account key to Expo: `eas credentials`.
3. Pick a random string and set it as the function secret: `supabase secrets set PUSH_WEBHOOK_SECRET=<value>`.
4. Deploy: `supabase functions deploy push-notify --no-verify-jwt`.
5. In the Supabase SQL editor, store the URL and secret in Vault (the migration `push_notify_webhook` reads them; without them it sends nothing):
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_notify_url');`
   `select vault.create_secret('<the same value as step 3>', 'push_notify_secret');`
6. Apply migrations (`supabase db push`) and use a dev or release build; push does not work in Expo Go on Android.
