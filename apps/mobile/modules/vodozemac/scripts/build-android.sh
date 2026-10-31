#!/usr/bin/env bash
# Build libpulse_vodozemac.so for each Android ABI and generate the uniffi Kotlin bindings.
# Needs: rustup with `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`,
# `cargo install cargo-ndk`, the Android NDK (ANDROID_NDK_HOME), and a host C linker
# (MSVC Build Tools on Windows, or run in WSL / Linux / CI).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here/rust"
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o "$here/android/src/main/jniLibs" build --release
# Kotlin bindings are generated from the library metadata of a host build.
cargo build --release
lib="$(find target/release -maxdepth 1 \( -name libpulse_vodozemac.so -o -name libpulse_vodozemac.dylib -o -name pulse_vodozemac.dll \) | head -1)"
cargo run --release --bin uniffi-bindgen -- generate --library "$lib" --language kotlin --no-format --out-dir "$here/android/src/main/java"
echo "done: jniLibs + Kotlin bindings (package uniffi.pulse_vodozemac)"
