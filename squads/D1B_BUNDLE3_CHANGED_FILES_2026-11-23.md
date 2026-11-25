# D1b Bundle 3 — Changed Files (P31)

Baseline: `jarvis-repo-P31.zip`, with the accepted S05 Bundle 2 patch applied before this delta.

This list is the D1b-owned delta only. It intentionally excludes generated `self/registry/*.json`, all S05-owned implementation files, `api/`, `vercel.json`, and `packages/contracts`.

## Shared privacy classifier + regression coverage

- `features/core-workspace/task-manager/KNOWLEDGE.md`
- `features/core-workspace/task-manager/manifest.json`
- `features/core-workspace/task-manager/src/sensitivity.mjs`
- `features/core-workspace/task-manager/tests/sensitivity.test.mjs`
- `packages/memory/KNOWLEDGE.md`
- `packages/memory/manifest.json`
- `packages/memory/src/classify.ts`
- `packages/memory/tests/rules.test.ts`
- `features/core-workspace/activity-logs/tests/privacy-hinglish.test.mjs` — regression using S05's real privacy wrapper and actual S08/S09 classifier helpers; requires the accepted S05 patch.

## S10 Insights

- `features/core-workspace/insights/KNOWLEDGE.md`
- `features/core-workspace/insights/manifest.json`
- `features/core-workspace/insights/src/handler.ts`
- `features/core-workspace/insights/src/api-client.ts`
- `features/core-workspace/insights/ui/InsightsPage.tsx`
- `features/core-workspace/insights/ui/insights.css`
- `features/core-workspace/insights/tests/insights-handler.test.mjs`

## S10 Boards

- `features/core-workspace/boards/KNOWLEDGE.md`
- `features/core-workspace/boards/manifest.json`
- `features/core-workspace/boards/src/handler.ts`
- `features/core-workspace/boards/src/api-client.ts`
- `features/core-workspace/boards/ui/BoardsPage.tsx`
- `features/core-workspace/boards/ui/boards.css`
- `features/core-workspace/boards/tests/boards-handler.test.mjs`
- `packages/db/migrations/0073_s10_boards.sql` — proposal only; not applied.

## Change requests and handoff

- `squads/CR_S08_PRIVACY_HINGLISH_2026-11-23.md`
- `squads/CR_S09_PRIVACY_HINGLISH_2026-11-23.md`
- `squads/CR_S10_LEAD_API_CONTRACTS_2026-11-23.md`
- `squads/CR_S10_S22_POWERS_2026-11-23.md`
- `squads/CR_S10_S00_SHELL_MOUNT_2026-11-23.md`
- `squads/CR_D2_NEWS_PLACEMENT_2026-11-23.md`
- `squads/ANTIGRAVITY_D1B_BUNDLE3_2026-11-23.md`
- `squads/D1B_BUNDLE3_REPORT_2026-11-23.md`
- `squads/D1B_BUNDLE3_CHANGED_FILES_2026-11-23.md`
