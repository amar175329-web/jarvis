# Antigravity Build Prompt — JARVIS S05 Bundle (2)

Baseline is exactly `jarvis-repo-P31.zip`. Apply only `JARVIS-S05-Bundle2-P31.patch`.

1. Preserve the approved JARVIS UI reference. Do not redesign cards, tokens, colors, or icons.
2. Do not add a file under `api/`; do not edit `vercel.json`; do not add a serverless function. Mount both S05 action modules in the existing `api/tasks/index.ts` as specified in `squads/CR_S05_BUNDLE2_2026-11-23.md`.
3. Do not include or hand-edit `self/registry/*.json`. Run `npm run register` after patch application, then `npm run check`.
4. Add the exact S05 route contracts to `packages/contracts/src/routes.ts` only after LEAD accepts CR-S05-CONTRACTS. All routes are owner-only, POST, no-store and return the repository envelope.
5. Ask S22 to register `history.read` and `activity-logs.read` with L0/L0 and max L2. Do not raise levels in this work. L0/L1 are read-only observation; if later at L2, the handler requires `confirmed: true` and the UI asks the owner explicitly. Missing power or ON/unreadable kill switch must block.
6. Review migration `packages/db/migrations/0072_s05_activity_log_timeline.sql`; apply it only after LEAD accepts CR-S05-DB. Verify existing owner_all policy is retained, RLS is ON and FORCED, and anon has no grants. S05 did not apply the migration.
7. Use the existing `chat_threads`, `chat_messages`, and `activity_log` tables; do not create duplicate history or logging tables. Use owner session + anon key + user's bearer for PostgREST; no service-role key in app/features.
8. Mount `HistoryPage` in the existing shell following CR-S05-S00. Reuse the History icon already present in the sidebar, make it a clickable navigation item, and place Activity Logs as a History tab. Check 390px for horizontal overflow.
9. Private content must never be sent to the cloud model or local model. Do not add model calls. Keep private message/title and activity detail masking as implemented. Cross-squad `logActivity()` calls must contain only allow-listed metadata and one-line why.
10. Run:
   - `npm run register`
   - `npm run check`
   - `node --test features/core-workspace/activity-logs/tests/*.test.mjs features/core-workspace/history/tests/*.test.mjs` (use the repo-supported Node version; local development environment used Node 22.16 with `--experimental-strip-types`)
   - Full relevant API/package tests
   - PGlite / DB RLS tests and migration validation
   - App build
   - 390px browser test
   Report the exact commands and actual outcomes. Do not claim tests that did not run as PASS.

No other feature bundle should be started by this prompt.
