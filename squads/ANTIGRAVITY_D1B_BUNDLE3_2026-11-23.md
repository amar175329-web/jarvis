# Antigravity Build Prompt — D1b Bundle 3 (P31)

Apply only after LEAD accepts the implementation and CRs.

## Baseline and patch order

Use `squads/D1B_BUNDLE3_CHANGED_FILES_2026-11-23.md` as the D1b-owned file inventory. It intentionally excludes generated registry files and S05-owned paths.

1. Start from the exact `jarvis-repo-P31.zip` baseline.
2. Apply the already accepted `JARVIS-S05-Bundle2-P31.patch` first.
3. Apply `JARVIS-D1b-Bundle3-P31.patch` second.
4. Do not apply a P28/P29 patch or the S09 bundle patch here; this is a P31 handoff.
5. Do not include/merge generated `self/registry/*.json` from the patch. Run `npm run register` after accepting the manifest changes, then `npm run check`.

## Mandatory ownership constraints

- No new `api/` file; do not edit `vercel.json`.
- Do not edit `packages/contracts`; LEAD applies the exact contract request from `CR_S10_LEAD_API_CONTRACTS_2026-11-23.md`.
- Do not edit the app shell/sidebar in this feature patch; S00 applies `CR_S10_S00_SHELL_MOUNT_2026-11-23.md` while preserving existing visual tokens and icons.
- Do not apply migration 0073 until LEAD acceptance and DB review.
- Do not add any service-role key or secret. All handlers verify the owner session and use the owner's bearer with the Supabase anon key so RLS remains active.
- Do not add model calls. Private health/medicine/money/family/feelings/password text must not enter any model, Insights projection, decision row or activity log.

## A. Apply shared privacy classifier corrections

Keep the two shared classifier changes exactly scoped:
- `features/core-workspace/task-manager/src/sensitivity.mjs` (S08): self-harm/distress/bank balance/medicine typo terms; specific report phrases only; generic `report bhejni hai` remains safe.
- `packages/memory/src/classify.ts` (S09): same medicine/self-harm/distress/money phrase gap; remove broad `gym` from T2 health category but retain FITNESS intent tag.

Preserve existing tests. Do not replace the S08/S09 implementation with a new local classifier. S05 `privacy.ts` continues to call actual shared `classifySensitivity`, `classify`, and `findSecrets` helpers.

## B. Build S10 handlers and UI

Folder-first files (`manifest.json` + `KNOWLEDGE.md`) are already present in each S10 folder. Keep both unit IDs as `built`, version 0.2.0, and preserve only valid registered unit IDs in `uses`.

### Insights
- Mount action `insights.overview` only in the existing `api/tasks/index.ts` shared handler, before body parsing, using CR-S10's imports/dispatch snippet. Do not create a separate API function.
- Keep query projections narrow: `tasks(status)` filtered by `created_at`, `tasks(id)` for overdue count, `activity_log(ts,ok)` for event totals. No title/notes/detail/action/target/body selections.
- Keep the 7/30-day aggregate UI. 30-day data renders as five six-day bars.
- Keep `data-integration-slot="CR_D2_NEWS_PLACEMENT"` as a D2-owned News & Briefing seam. Do not implement the D2 content/provider here.

### Boards
- Mount `boards.*` actions via the same existing `api/tasks/index.ts` dispatch, before body parsing.
- Use only `s10_boards`, `s10_board_columns`, `s10_board_task_links`, linked to existing `tasks`; do not duplicate task text.
- Private task is absent from available choices; previously linked private card is generic only and must not expose status, priority, due date, or task-link action metadata.
- Verify all mutation actions pass `executePower()` with owner-scoped power registry and fail-closed kill-switch read; L0/L1 does not mutate; L2 requires explicit `confirmed:true`.
- Every intent/activity entry must use constant action and why strings only. No name/title/body/free text in logs.

## C. S22 powers

Apply the nine-row seed request in `CR_S10_S22_POWERS_2026-11-23.md` using the approved S22 path. Seed L0/current=0/default=0, max L2, `needs_confirm=true`, `tags=['personal']`; `boards.delete` is irreversible and must remain capped at L2. Do not promote automatically.

## D. Database migration

Review and apply `packages/db/migrations/0073_s10_boards.sql` only after LEAD approval. Confirm all three new tables have RLS ENABLE and FORCE, owner-only `auth.uid()` policies, `PUBLIC` and `anon` revoked, authenticated grants only, and same-owner task/board/column FKs. S05 migration 0072 is already reserved; do not edit it. Record the actual DB/PGlite result and migration checksum.

## E. Verify

Run in the accepted P31 repo with the supported Node version:

```bash
npm run register
npm run check
node --experimental-strip-types --test packages/memory/tests/rules.test.ts \
  features/core-workspace/task-manager/tests/*.test.mjs \
  features/core-workspace/activity-logs/tests/*.test.mjs \
  features/core-workspace/insights/tests/*.test.mjs \
  features/core-workspace/boards/tests/*.test.mjs
```

Also run the full TypeScript/React build, DB/RLS tests, real API auth/power checks, and Playwright at 390px. The development run used Node 22.16.0 with `--experimental-strip-types`; register/check also used `NODE_OPTIONS=--experimental-strip-types`. These do not substitute for CI on the repository-supported Node version. No check may be marked PASS unless it actually ran. Do not claim D2 patch compatibility until the actual D2 Bundle 3 patch has been applied and checked in combination.
