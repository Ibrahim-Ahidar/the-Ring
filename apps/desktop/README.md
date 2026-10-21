# @pulse/desktop

Thin Electron shell that opens the deployed Pulse Web Client (see spec.md section 5).

```
npm install                      # at the repo root
npm run dev -w @pulse/desktop    # build + open http://localhost:3000 (start apps/web first)
npm start -w @pulse/desktop      # build + open the production URL
npm test -w @pulse/desktop
```

`PULSE_URL` overrides the URL the window loads. Its origin is the only one that stays in the app;
every other link opens in the system browser. The default is the constant `DEFAULT_PULSE_URL` in
`src/main.ts` (the production site, https://the-ring-five.vercel.app).

Login persists via the default Electron session. Window size, position and maximised state are
stored in `window-state.json` under the app's userData folder.

Tray: the app lives in the system tray (menu: Open Pulse, Launch at login, Quit). Closing the
window hides it; only Quit really exits. "Launch at login" is stored in the OS login items
(`app.setLoginItemSettings`), with no state file of our own. The icon is `assets/tray.png`.

Offline: if Pulse cannot be reached (no network, DNS or connection errors), the window shows the
built-in `assets/offline.html` and retries with backoff (2s, 4s, 8s ... capped at 30s), plus on
"Try again" and on window focus. When the Pulse URL answers, it is loaded again.

## Release

Installers are built by `.github/workflows/desktop-release.yml` (Windows NSIS `.exe`, Linux
AppImage). To release, tag and push. The workflow sets the `apps/desktop/package.json` version from the tag (`desktop-v0.2.0` becomes `0.2.0`), so no version bump commit is needed:

```
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
```

The workflow builds both platforms and publishes them, with the update metadata
(`latest.yml`, `latest-linux.yml`), as a GitHub Release on this repo (uses `GITHUB_TOKEN`; no extra
secrets). Local test build: `npm run dist:win -w @pulse/desktop` (output in `apps/desktop/release/`,
gitignored); add `-- --dir` for an unpacked app only.

The installers are not code-signed. Windows SmartScreen shows "unknown publisher": click
"More info", then "Run anyway".

Auto-update: packaged builds call `electron-updater` after start, download a newer GitHub Release in
the background and install it on next quit. Failures (for example offline) are only logged. Set
`PULSE_NO_UPDATE=1` to disable. Unpackaged dev runs never check.

## Bridge (`window.pulseDesktop`)

Exposed by `src/preload.ts` to pages on the Pulse origin only:

- `version: string` - desktop app version.
- `notify({ chatId, title, body })` - show a native notification; clicking it focuses the window.
- `setUnreadCount(count)` - set the app badge, Windows taskbar overlay and tray tooltip.
- `onOpenChat(cb)` - `cb(chatId)` when a notification is clicked; returns an unsubscribe function.
