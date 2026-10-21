# 0001 — Desktop is a thin shell; Mobile calls Supabase RPCs directly

Status: accepted (2026-10-20)

## Context

Pulse's Web Client writes through Next.js server actions, which wrap Postgres RPCs (`src/features/*/service.ts` take an `RpcClient`). We are adding a Desktop Client (Electron) and a Mobile Client (React Native / Expo, Android first). Server actions can only be called by the Next app itself, not by a React Native bundle or a locally bundled UI.

## Decision

- **Desktop** loads the deployed Web Client URL inside Electron and adds native features (tray, notifications, badge, auto-update) through a preload bridge. It ships no UI of its own.
- **Mobile** talks to Supabase directly with `supabase-js`, using the same RPCs, row-level security and Realtime as the web. The RPC wrappers move to a shared `packages/core` that both web and mobile import. Logic that exists only inside a server action moves down into Postgres.
- There is no separate HTTP API layer.

## Alternatives rejected

- **Bundled Electron UI**: needs a static export, which breaks server actions and middleware, so it costs the same rewrite as mobile.
- **`/api/v1` route handlers for mobile**: a second contract to keep in sync with the RPCs, plus a Vercel function hop on every call.
- **Mobile as a WebView**: not native, and gives poor push and offline handling.

## Consequences

- Desktop updates whenever the web deploys, and works offline only as far as its built-in offline page.
- RPC signatures are now a public contract for installed Mobile builds. They change only additively; a breaking change means a new RPC name.
- The later local-first direction (Mobile as the primary Device, with a cloud backup) will revisit this. Mobile's data-access layer is the place where that swap happens.
