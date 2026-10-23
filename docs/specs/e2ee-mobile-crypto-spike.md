# Spike: vodozemac on the Mobile Client (issue #221)

Parent spec: `docs/specs/local-first-e2ee.md` sections 6.1 and 13. Status: module source and scripts written, **not yet compiled or run on a device** (see "Not verified").

## Question

Can the Mobile Client (Expo SDK 58, React Native 0.88, Hermes, Android first) call vodozemac for Olm accounts and sessions, Megolm group sessions and pickling, fast enough and maintainably?

## Routes considered (research, 2026-10)

| Route | Finding |
|---|---|
| (a) Existing maintained RN/Expo binding | None found. vodozemac has official bindings for JS/WASM, Python and (via matrix-sdk-crypto) Kotlin/Swift, but no React Native package. `@matrix-org/matrix-sdk-crypto-wasm` wraps the whole `OlmMachine`, not vodozemac itself, and targets browsers. Community WASM repos cover only Megolm. Not usable. |
| (b) Own Rust crate with uniffi, plus an Expo Module (Kotlin) over uniffi's Kotlin bindings and prebuilt `.so` per ABI | Realistic. uniffi (0.29/0.32) is mature for Kotlin, `cargo-ndk` builds the four ABIs, and Expo Modules API loads the result with a small Kotlin class. Cost: we own a ~200 line Rust wrapper and a native build step. |
| (b2) `uniffi-bindgen-react-native` (JSI TurboModule, latest 0.31.0-x, still pre-release) | Generates JSI bindings directly, no Kotlin bridge, binary data without base64. Pre-release versioning and New-Architecture coupling make it a riskier dependency than the Kotlin route today. Good upgrade path later because the Rust crate is reusable. |
| (c) vodozemac WASM in a JSI WebAssembly runtime | Fallback, see below. |

**Picked: (b).** vodozemac is audited Rust, so the wrapper adds no cryptography (spec D10). The same crate can later feed iOS (uniffi Swift) or (b2).

## What was built (all under `apps/mobile`)

- `modules/vodozemac/rust/` crate `pulse_vodozemac`: uniffi objects `OlmAccount`, `OlmSession`, `MegolmOutbound`, `MegolmInbound`; every method forwards to vodozemac. Pickles are vodozemac's encrypted pickles under a 32 byte key. Keys, ciphertexts and pickles are strings, plaintext is bytes.
- `modules/vodozemac/android/` Expo Module `Vodozemac` (Kotlin): handle based bridge (JS holds string handles, native keeps the objects), `build.gradle` with JNA, `jniLibs` output folder.
- `modules/vodozemac/scripts/build-android.sh` (`npm run build:vodozemac`): `cargo ndk` for arm64-v8a, armeabi-v7a, x86_64, x86, then generates the Kotlin bindings with `uniffi-bindgen`. Generated files and `.so` files are gitignored.
- `modules/vodozemac/src/index.ts`: typed JS layer (`createVodozemac`, `getVodozemac`), Uint8Array to base64 at the boundary.
- Dev-build workflow: `expo-dev-client`, `eas.json` (`development`, `preview`, `production`), `start` scripts use `--dev-client`, README rewritten. Jest roots now include `modules/`.

### Shape versus CryptoEngine

`packages/core/src/crypto/crypto-engine.ts` (issue #222, branch `e2ee-222-crypto`) was not visible when this was written, so the JS API follows the spec (account, Olm session encrypt/decrypt, Megolm out/in sessions, pickle). Likely mismatches to reconcile when #222 lands: sync versus Promise (the native bridge is async, so the interface must be Promise based for mobile), base64 string versus Uint8Array for ciphertext, and handle lifetime (`free()` must be called or the native map grows). An adapter class in the mobile app should implement `CryptoEngine` over `createVodozemac`.

## Verified here

- Jest test of the JS layer with the native side faked (`modules/vodozemac/src/vodozemac.test.ts`): base64 round trip, Olm setup plus encrypt/decrypt flow, Megolm flow, pickle key encoding, handle release.

## Not verified (waiting on the user or a Linux/CI box)

This Windows machine has no C linker (no MSVC Build Tools, no mingw), so even `cargo check` cannot run (proc-macro crates need a host link). Rust was installed in user space via rustup but nothing was compiled. Hence:

1. The Rust crate has never been compiled. vodozemac method names (`to_parts`, `from_parts`, `AccountPickle::from_encrypted`, `create_inbound_session` result fields) follow the 0.9 docs from memory and may need small fixes. Pin exact crate versions after the first build.
2. The Kotlin module and the uniffi-generated Kotlin API (property names such as `messageType`, `oneTimeKeys()`) are unbuilt.
3. No `expo run:android` build and no on-device Olm round trip. EAS cloud build needs the user's Expo login; it was not run.

Steps for the user, on a machine with the toolchain (or WSL/Linux):

```
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
cargo install cargo-ndk
# Android NDK via sdkmanager "ndk;27.x", set ANDROID_NDK_HOME
cd apps/mobile && npm run build:vodozemac
npx expo run:android     # emulator or USB phone
```

Then call `getVodozemac()` from a debug screen: create two accounts, publish one one-time key, create the outbound and inbound sessions, encrypt and decrypt, and do the same for a Megolm pair. Fix compile errors in `lib.rs`/`VodozemacModule.kt` as they appear (expected to be small).

Alternative that avoids the local toolchain: add a GitHub Actions job that builds the `.so` files on Linux and caches them, and run `eas build --profile development --platform android` (needs `eas login`).

## Fallback: vodozemac WASM in a JSI runtime

If the native route proves too costly (Rust toolchain in CI, ABI matrix, uniffi churn), run the same vodozemac WASM that Desktop and Web already use (spec 6.1) inside Hermes.

- Hermes has no WebAssembly. Options: `react-native-wasm` / Polygen (compile WASM to native C via wasm2c at build time, exposed through JSI), or embed a WASM interpreter such as wasm3 as a JSI module.
- Pros: one crypto build for all three Clients, one set of tests, no per-ABI Rust build.
- Cons: more moving parts at the RN boundary (these libraries are young and less used than Expo Modules), vodozemac WASM uses `getrandom` with a JS entropy import that must be wired to `expo-crypto`/native secure random, slower than native (interpreter) or a bigger build (wasm2c), and still needs a dev build, so it does not remove the `expo-dev-client` change.

## Recommendation

1. Keep route (b): uniffi plus Expo Module (Kotlin), Android first. It uses the best-supported pieces (Expo Modules API, uniffi Kotlin, cargo-ndk) and keeps vodozemac native speed on the hot send path.
2. Treat the on-device round trip as the gate for P3 (#222 onward). Until it passes, build against the `CryptoEngine` interface with the fake, which is how #222 is already structured.
3. If the first build hits something not fixable in about a day (for example uniffi plus vodozemac incompatibility), switch to the WASM fallback via Polygen, and keep the JS layer API unchanged, since `createVodozemac(native)` takes any implementation of `NativeVodozemac`.
4. Later, evaluate `uniffi-bindgen-react-native` once it has a stable release: same Rust crate, no base64 bridge.
