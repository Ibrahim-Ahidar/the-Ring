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
