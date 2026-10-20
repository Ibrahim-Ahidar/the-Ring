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
`src/main.ts` (a placeholder until the production URL is fixed).

Login persists via the default Electron session. Window size, position and maximised state are
stored in `window-state.json` under the app's userData folder.

Tray: the app lives in the system tray (menu: Open Pulse, Launch at login, Quit). Closing the
window hides it; only Quit really exits. "Launch at login" is stored in the OS login items
(`app.setLoginItemSettings`), with no state file of our own. The icon is `assets/tray.png`.

Offline: if Pulse cannot be reached (no network, DNS or connection errors), the window shows the
built-in `assets/offline.html` and retries with backoff (2s, 4s, 8s ... capped at 30s), plus on
"Try again" and on window focus. When the Pulse URL answers, it is loaded again.
