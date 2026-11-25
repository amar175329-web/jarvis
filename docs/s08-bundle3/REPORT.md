# S08 Bundle 3 — Tasks + Reminders polish

**Base:** `jarvis-repo-P31.zip` (freshly extracted and read; patch is generated against that exact tree).
**Status:** Client/UI/parser changes are included. New server routes, server-side clash enforcement, migration and powers are documented as CRs/proposals only. This is not an end-to-end production-ready server patch until LEAD/Antigravity mounts and tests those changes.

## Delivered in this patch

- Optimistic item-level updates for task/reminder Done, Cancel, Delete and Edit. Mutations patch only the affected item from the server response; they do not request the entire list after every action.
- Done/Cancel changes the row locally immediately, then waits five seconds before calling the existing route. Undo cancels the queued call. `pagehide` and unmount flush remaining calls through the same route using `fetch(..., { keepalive: true })`.
- Inline Cancel confirmation: `Pakka cancel karein?`, `Haan, cancel karo`, `Nahi`; auto-dismisses after five seconds. No `Confirm` wording is used.
- Delete confirmation warns `Wapas nahi aayega`; the item fades/removes locally and calls the hard-delete endpoint immediately. Client restores the exact row on request failure. Reminder job cancellation + hard delete are server-side atomic requirements in the API/SQL CR; not implemented in UI code.
- Done/cancelled task and reminder rows move into collapsed `Cancelled / Done` archive sections. Task count includes only `todo` and `doing`. Task Delete is present for active and archived rows; reminder Edit/Done/Cancel/Delete for active rows and Delete for archived rows.
- Reminder editing includes text, time and repeat fields. Client applies the shared sensitivity classifier to edited text; server-side enforcement is mandatory and specified in the API CR.
- Quiet reconciliation runs on focus, visible `visibilitychange`, and every 30 seconds while visible. Background refresh failures stay silent and do not overwrite an existing action banner; explicit load/Retry errors are shown in Hinglish.
- Network failures map to `Network dikkat, dobara try karo`; a successful action whose returned item is unavailable maps to `Kaam ho gaya, list abhi nahi aayi`. Retry replays the failed operation.
- Parser recognizes intervals and emits `ends_at`; ambiguous AM/PM uses the existing clarification flow. Reminder-intent phrases (`yaad dilao`, `yaad karana`, `remind`) route to reminders and are removed from the reminder subject.
- Approved card classes, tokens and icon references are retained. CSS additions are scoped to S08, wrap action controls and set mobile-safe min-width/overflow constraints.
- Folder-first knowledge files/manifests updated only within S08 feature folders. No self/registry JSON changed.

## CRs / proposal included (not applied)

- `CHANGE_REQUEST_API.md`: exact schemas and placement guidance for `tasks.delete`, `reminders.update`, `reminders.complete`, `reminders.delete`; extensions for `ends_at`, clash override and duplicate override; server-side clash rules; privacy; owner bearer + anon key + RLS; metadata-only audit; L2; live kill-switch read after powers/audit and immediately before the write; reminder job/state transaction requirements.
- `CHANGE_REQUEST_POWERS.md`: four S22 power IDs at autonomy current/max 2, `needs_confirm=true`; delete powers `reversible=false`.
- `0061_s08_proposal.sql`: nullable `tasks.ends_at`, safe check constraint, `reminders.state='done'`, owner/status/due index, and owner-invoker transactional reminder state/edit/delete RPCs. Proposal only; not placed in `packages/db/migrations/` and not applied. Existing migration 0060 is untouched.
- `ANTIGRAVITY_BUILD_PROMPT.md` and `CHANGED_FILES.md` contain integration steps and the full file inventory.

## Commands actually run and results

1. `unzip -q /mnt/data/jarvis-repo-P31.zip -d /mnt/data/s08-bundle3-base` — extracted a fresh P31 baseline.
2. `node --test features/core-workspace/task-manager/tests/*.test.mjs` — one earlier exploratory run had 1 failure because a new test omitted the `createAutoDismissTimer` import; import fixed.
3. `node --test features/core-workspace/task-manager/tests/*.test.mjs` — **42 passed, 0 failed** after that correction (intermediate run).
4. `node --test features/core-workspace/task-manager/tests/*.test.mjs features/core-workspace/reminders/tests/*.test.mjs` — final run: **61 passed, 0 failed, 0 skipped**. This final run includes parser/range/reminder-intent tests, optimistic rollback/count/undo/pagehide/error helper tests, sensitivity tests, and existing reminder worker-handler unit tests. It does not exercise the unimplemented API/DB actions.
5. `tsc --noEmit --jsx react-jsx --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --allowJs --checkJs false /tmp/s08-react-shim.d.ts features/core-workspace/task-manager/ui/TaskManagerPage.tsx features/core-workspace/task-manager/src/api-client.ts` — **exit 0, no diagnostics**. `/tmp/s08-react-shim.d.ts` is a temporary local React declaration shim because the uploaded P31 tree has no installed React type dependency; it is not part of the patch.
6. `git apply --check /mnt/data/JARVIS-S08-BUNDLE3-P31.patch` against a newly extracted clean P31 checkout — **PASS**. The patch was then applied to that checkout with `git apply`.
7. `git add -A && git diff --cached --check` in the patched clean P31 checkout — **PASS** (22 changed paths including six bundle-document files).
8. Restricted-path audit over the patched checkout — **PASS**; no diff paths under `api/`, `vercel.json`, `packages/contracts/`, `packages/db/migrations/`, `worker/`, `self/registry/` or `app/src/`.

## NOT RUN (do not treat as PASS)

- S05 Bundle 2 + D2 Bundle 3 combined patch apply-check: **NOT RUN**. Their patch files were not attached in this conversation, so the required combined-baseline check cannot be performed from the provided material.
- Browser/component tests and a real 390px viewport overflow/screenshot test: **NOT RUN**. CSS has mobile constraints, but no browser/visual PASS is claimed.
- Backend API tests for the four new actions; server task clash and reminder duplicate checks: **NOT RUN**. Exact implementation is in the LEAD/Antigravity CR.
- PGlite/real DB migration 0061, RLS owner-isolation, transactional reminder-job replace/delete, and job failure rollback tests: **NOT RUN**. Migration remains proposal-only.
- S22 live power confirmation, audit failure and kill-switch ON/unreadable tests: **NOT RUN**. Powers are CR-only.
- `npm ci`, full Vite app build, full repository test suite, Android phone tests and notification delivery: **NOT RUN**.

## Explicitly untouched

No `api/` file, `vercel.json`, `packages/contracts/`, `packages/db/migrations/`, `packages/brain/`, `packages/safety/`, `worker/`, `self/registry/*.json`, `app/src/`, Today Focus/Schedule cards or D2-owned UI was changed. Reminder firing/Android notification implementation is out of scope.

## Acceptance gates

1. LEAD accepts `CHANGE_REQUEST_API.md` and mounts all new/extended actions in the existing `api/tasks/index.ts` function only.
2. S22 accepts and registers all four powers at current/max 2 with `needs_confirm=true` and hard deletes `reversible=false`.
3. Antigravity reviews and applies proposal 0061 only after acceptance; never edit/replay 0060.
4. Run server and DB acceptance tests, then browser and 390px checks. Do not enable new client routes in production before server contract/migration/power acceptance.
