# @pulse/mobile

Expo Router Android client for Pulse (spec section 6, ADR 0001). This ticket covers login, logout and a session kept in secure storage; the rest of the Mobile Client comes in later tickets.

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

## Run (development build)

The app no longer runs in Expo Go: the vodozemac native module (spec section 6.1) and push need a development build (`expo-dev-client`). Build the app once, then use Metro as usual.

1. One-time native library build (needs Rust, `cargo-ndk`, the Android NDK and a host linker; see `docs/specs/e2ee-mobile-crypto-spike.md`): `npm run build:vodozemac`. Without it the app still builds, but `getVodozemac()` throws on first use.
2. Local build and install (Android Studio SDK, emulator or USB device with debugging on): `npx expo run:android` (also `npm run android`).
3. Cloud build: `eas login`, then `npm run build:dev` (`eas build --profile development --platform android`). Install the resulting APK on the phone. Needs your Expo account; nothing here logs in for you.
4. Daily work: `npm run start` (`expo start --dev-client`), open the installed Pulse dev app and connect. `npm run start:usb` runs `adb reverse tcp:8081 tcp:8081` first (most reliable); `npm run start:tunnel` works across networks (slower).
5. `npm run start:go` starts Metro for Expo Go. Only screens that don't touch native modules beyond the Expo SDK work there.
6. Rebuild the dev app only when native code or `app.json` plugins change (new Expo module, the Rust library). JS changes hot reload.
7. If the phone can't reach port 8081 over Wi-Fi on Windows, set the network to Private and allow Metro through the firewall (admin PowerShell): `Set-NetConnectionProfile -InterfaceAlias Wi-Fi -NetworkCategory Private` then `New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`. `npx expo start --clear` resets a stale Metro cache.
8. An Android emulator on the same machine reaches a local Supabase at `http://10.0.2.2:54321`.

### Local debug APK on Windows (no EAS)

Tested on Windows 10 with Rust 1.99, NDK 30, Android Studio's bundled JDK. One-time: `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`, `cargo install cargo-ndk`, and MSVC Build Tools (host linker for the uniffi bindgen).

```
# PowerShell, from the repo root
npm install
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME
dk.0.16248370"
$env:JAVA_HOME = "C:\Program Files\Android Studio\jbr"   # your Android Studio JBR path
$env:Path += ";$env:USERPROFILE\.cargoin"
cd apps\mobile
npm run build:vodozemac            # .so for arm64-v8a, armeabi-v7a, x86_64 + Kotlin bindings (first run ~5 min)
$env:EXPO_PUBLIC_PULSE_E2EE = "1"  # optional: shows the dev self-test row in Settings
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleDebug --max-workers=2 "-Dorg.gradle.jvmargs=-Xmx2g"
adb install -r appuild\outputspk\debugpp-debug.apk
```

If paths get too long ("Filename too long"), map the checkout to a drive first: `subst W: "D:\path	o\worktree"` and run from `W:pps\mobile`; remove with `subst W: /d`. `apps/mobile/android` is generated and ignored by git.

Check the native module on a phone: start Metro (`npm run start:usb`), open the dev app, Settings, "E2EE self-test (dev)" (needs `EXPO_PUBLIC_PULSE_E2EE=1`, dev build only), tap the button. It runs an Olm pre-key + reply + pickle round trip and a Megolm message through the real Rust library and shows PASS/FAIL per step. With the flag off the row and screen do not exist.

`eas.json` profiles: `development` (dev client, internal APK), `preview` (internal APK), `production` (app bundle).

## Scripts

`start`, `start:usb`, `start:tunnel`, `start:go`, `android` (local dev build), `build:dev` (EAS), `build:vodozemac`, `test` (jest-expo), `typecheck`, `lint`.

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
