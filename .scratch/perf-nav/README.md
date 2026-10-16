# perf-nav: navigation baseline

Method (D11): production build (`next build` + `next start`), one seeded member with two chats, Playwright journeys, median of 5 runs, server trace with `PULSE_PERF_TRACE=1`.

## Rerun
1. `npx supabase start`, then export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from `npx supabase status -o env`).
2. `npm run perf:nav` (before a change) or `npm run perf:nav -- --label after` (after it). Flags: `--skip-build`, `--runs N`. Port: `PERF_PORT` (default 3100).
3. Outputs in this folder: `build-<label>.txt` (route table), `nav-<label>.json` (medians and samples in ms), `trace-<label>.txt` (Supabase round trips per journey), plus raw `server-<label>.log` and `windows-<label>.json`.

Journeys: `login_to_chats_ready`, `open_chat` (click to last message visible), `switch_chat_a_to_b`, `chats_to_groups`, `open_settings`.

## Compare
Diff `medianMs` in `nav-before.json` vs `nav-after.json`, and the round-trip counts in the trace files. Two runs of the same build should agree within ±15%.

## Status of the committed baseline
`build-before.txt` is real (Next 15.5.27 build). `nav-before.json` and `trace-before.txt` are placeholders: the worker machine had no Docker/Supabase, so the journeys could not run. Run `npm run perf:nav` where Supabase is available and commit the results.
