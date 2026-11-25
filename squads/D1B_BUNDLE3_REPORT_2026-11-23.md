# D1b Bundle 3 Report — Privacy classifier + S10 Insights / Boards

**Baseline:** `jarvis-repo-P31.zip` only
**Bundle order:** A) shared privacy classifier corrections, B) S10 Insights + Boards
**Patch:** `JARVIS-D1b-Bundle3-P31.patch`
**Status:** implementation patch prepared; LEAD / S22 / S00 / D2 integration and Antigravity DB application pending. Delta has 33 files, including the changed-files inventory.

## A. Privacy classifier gap: root causes and fixes

LEAD's exact misses were caused by missing Hinglish vocabulary in both independent shared classifiers:

- S08 `features/core-workspace/task-manager/src/sensitivity.mjs` had no `khud ko hurt` / self-harm construction, no `udaas` distress pattern, no bank-balance question pattern, and incomplete medicine typo variants (`dwai`, `daava`). Its generic report keyword also caught the benign `report bhejni hai` phrase.
- S09 `packages/memory/src/classify.ts` had English self-harm patterns but lacked the `khud ko hurt` Hinglish phrase, missed `udaas` forms and bank-balance questions, and lacked the medicine typo variants. Its broad `gym` health term marked a routine `gym jaana` note T2.

Changes:

- Added explicit Hinglish self-harm and emotional-distress vocabulary to S08 and S09. S09 keeps `care: 'self_harm'` on self-harm hits.
- Added bank/account balance and paisa/paise question forms that do not require a numeric amount.
- Added Roman Hinglish medicine spellings including `dwai`, `dawa`, `daava`, `dava`, `davai`, `dawaai`, plus `goli` variants.
- Removed generic `report` matching in S08, retaining only specific medical/lab/test report phrases and Devanagari equivalents.
- Removed `gym` from S09's T2 health-category keyword list while retaining it in the separate workout/fitness intent helper. Therefore `gym jaana` is not T2 by itself.
- Added direct S08 and S09 classifier tests and an S05 `isPrivateText()` integration regression test using the actual S08 `classifySensitivity()` and actual S09 `classify()` / `findSecrets()` wrapper. No fake regex was added to the privacy wrapper.

Separate CRs identify exact shared files and the requested change: `CR_S08_PRIVACY_HINGLISH_2026-11-23.md` and `CR_S09_PRIVACY_HINGLISH_2026-11-23.md`.

## B. S10 feature implementation

### Insights

- Reads only `tasks(status)` with a bounded `created_at` filter, `tasks(id)` for overdue counting, and `activity_log(ts,ok)` for event totals/trend.
- It does not select title, notes, detail JSON, activity action, target, message, memory or file content.
- Returns totals/status buckets/completion percentage/overdue count/activity counts only. Thirty days are compressed into five six-day visual bars to keep the mobile chart compact.
- Includes a labelled `CR_D2_NEWS_PLACEMENT` slot in the Insights page. D2 owns its News & Briefing implementation; this bundle contains only the placeholder.
- No model calls.

### Boards

- New owner-scoped boards, columns and task-link tables; links existing S08 tasks rather than copying task text.
- Private task text is omitted from `boards.tasks.available`. Previously linked private tasks return only `id`, generic `Private task`, and `private=true`; status, priority, due date and link action metadata are omitted.
- Board and column labels pass through S05's shared `isPrivateText()` check. Audit/decision rows contain only constant action/why metadata; no board name, column name or task text is logged.
- Every mutation runs through `executePower()` after a metadata-only decision intent and S05 `logActivity()` write. Missing power and ON/unreadable kill-switch state fail closed. L0/L1 mutations do not execute; L2 requires `confirmed:true`.
- Board reads use registered `boards.read`, and the UI has a separate explicit read-confirmation path for L2.
- Fixed a UUID validator segment-length bug found by the new task-link handler test.

### Database

`packages/db/migrations/0073_s10_boards.sql` is an **unapplied proposal** only. It creates `s10_boards`, `s10_board_columns`, and `s10_board_task_links`, enforces same-owner foreign keys, enables and forces RLS on every new table, creates owner-only authenticated policies, revokes `PUBLIC`/`anon`, and grants the required operations only to `authenticated`. Antigravity must apply only after LEAD accepts the CR. Migration `0072` remains S05's; S10 uses `0073`.

## Security and scope checks

- No new file under `api/`.
- `vercel.json` untouched.
- `packages/contracts` untouched; exact contract request is in `CR_S10_LEAD_API_CONTRACTS_2026-11-23.md`.
- `self/registry/*.json` generated files are excluded from the patch; Antigravity runs `npm run register`.
- No service-role key; handlers use owner session + owner's bearer + Supabase anon key and owner_id filters.
- No cloud/local model call. Private text is not used in model inputs, Insights projections, decision logs or activity logs.
- Existing UI cards/tokens/icons are reused in feature-local UI. App shell/sidebar is not changed; S00 mounting is a separate CR.

## Actual commands and results

Commands were run in the extracted P31 working tree, with S05 Bundle 2 applied for the integration regression tests. Environment Node is v22.16.0 while the repository declares Node >=22.18.0, so Node's experimental TS type-strip flag was needed.

| Exact command | Actual result |
|---|---|
| `node --experimental-strip-types --test packages/memory/tests/rules.test.ts features/core-workspace/task-manager/tests/*.test.mjs features/core-workspace/activity-logs/tests/*.test.mjs features/core-workspace/insights/tests/*.test.mjs features/core-workspace/boards/tests/*.test.mjs` | **106 passed, 0 failed, 0 skipped** |
| `NODE_OPTIONS=--experimental-strip-types npm run register` | **REGISTER OK: 170 units, 0 agent office(s) created, 5 registry file(s) rewritten** on the final clean P31 + S05 + D1b verification tree |
| `NODE_OPTIONS=--experimental-strip-types npm run check` | **CHECK PASSED: 170 units, 40 containers** (CI diff rule skipped because no `--base` ref was supplied) |
| `node --experimental-strip-types --check` on seven touched `.mjs` / `.ts` runtime and API-client modules | **7/7 syntax checks passed** |
| `git apply --check JARVIS-D1b-Bundle3-P31.patch` on clean P31 | **PASS** |
| `git apply --check JARVIS-S05-Bundle2-P31.patch`, then `git apply --check JARVIS-D1b-Bundle3-P31.patch` on clean P31 | **Both PASS in sequence**; combined worktree had zero forbidden paths |
| `git diff --check` after applying both patches | **PASS** |

The Node handler tests use an injected fetch stub to exercise the real handler, policy/gate, classifier and response paths. They are unit tests, **not** live Supabase/RLS evidence.

## NOT RUN (do not mark PASS)

- `npm ci` and a full TypeScript/React application build (repo Node engine is newer than the available runtime).
- `npm run test:all`.
- PGlite/PostgreSQL execution of migration 0073; no live DB/RLS test or migration application.
- Browser/Playwright responsive verification at exactly 390px.
- Live Vercel shared-function mount, real Supabase auth, real power seeding, and S22 kill-switch integration.
- D2 Bundle 3 patch coexistence check: no D2 patch file was attached or present in the supplied workspace during this run. The Insights page leaves the D2 integration slot, and a D2 placement CR is supplied, but exact combined `git apply --check` against D2's patch is **NOT RUN** until that patch is supplied. S05 + D1b coexistence was checked and passed.

## Change requests / handoff

- `D1B_BUNDLE3_CHANGED_FILES_2026-11-23.md` — exact D1b-owned path inventory; generated registry files and S05-owned files excluded.
- `CR_S08_PRIVACY_HINGLISH_2026-11-23.md` — S08 shared classifier change.
- `CR_S09_PRIVACY_HINGLISH_2026-11-23.md` — S09 memory classifier change.
- `CR_S10_LEAD_API_CONTRACTS_2026-11-23.md` — route mount and exact route/body/result contracts.
- `CR_S10_S22_POWERS_2026-11-23.md` — nine L0-seeded powers, max L2, confirmation policy.
- `CR_S10_S00_SHELL_MOUNT_2026-11-23.md` — sidebar/page mount without redesign.
- `CR_D2_NEWS_PLACEMENT_2026-11-23.md` — News & Briefing integration seam.
- `ANTIGRAVITY_D1B_BUNDLE3_2026-11-23.md` — application prompt.

## State snapshot

1. Exact baseline: P31.
2. Privacy gaps corrected in both S08 and S09 shared classifiers.
3. S05 privacy wrapper regression test uses real classifier helpers.
4. S10 Insights returns metadata aggregates only; News slot reserved for D2.
5. S10 Boards link existing tasks only; private task metadata masked.
6. All board mutations use registered powers + `executePower` + fail-closed kill switch.
7. 0073 is proposal-only; RLS is ENABLE + FORCE in SQL.
8. 106 focused Node tests passed; register/check passed.
9. S00 shell, LEAD contracts/API mount, S22 powers and Antigravity DB apply pending.
10. D2 patch coexistence and browser 390px test are NOT RUN.
