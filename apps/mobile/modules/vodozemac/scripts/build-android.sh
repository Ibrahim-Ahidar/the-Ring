#!/usr/bin/env bash
# Build libpulse_vodozemac.so for each Android ABI and generate the uniffi Kotlin bindings.
# Needs: rustup with `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`,
# `cargo install cargo-ndk`, the Android NDK (ANDROID_NDK_HOME), and a host C linker
# (MSVC Build Tools on Windows, or run in WSL / Linux / CI).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here/rust"
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 -o "$here/android/src/main/jniLibs" build --release
# Kotlin bindings are generated from the library metadata of a host build.
cargo build --release
lib="$(ls target/release/libpulse_vodozemac.* | head -1)"
cargo run --release --bin uniffi-bindgen -- generate --library "$lib" --language kotlin --out-dir "$here/android/src/main/java"
echo "done: jniLibs + Kotlin bindings (package uniffi.pulse_vodozemac)"
