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
