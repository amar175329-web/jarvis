# S09 Bundle 1 Report — Memory + Notes-Files + Projects

Date: 2026-11-22
Target baseline: `jarvis-repo-P29.zip`
Owner: D1b / S09
Status: **implementation draft; LEAD / S22 / Antigravity / S19 changes pending**

## Scope delivered

Bundle (1) only: `memory`, `notes-files`, `projects`. Remaining department order is:

1. Memory + Notes-Files + Projects (S09) — this bundle.
2. History + Activity-Logs (S05).
3. Insights + Boards (S10).
4. Knowledge-Base (S09).

No second bundle has been started.

## What changed

- Added plain ESM feature handlers exporting `actions` and `handle(action, request, context)` in each owned feature folder. No new `api/` function was added.
- Added S08 sidebar navigation for the Memory page using the existing `Memory` icon/entry and Today/Tasks interaction pattern. Used the approved S08 cards/tabs, tokens and icons; did not redesign Home or the reference shell.
- Added Memory / Notes / Files / Projects tabs. Normal content stays in the normal lists. Private content is returned to the browser only as a generic placeholder and shown in a separate section with the literal `private` badge.
- Added note/project/memory create/list behavior and double-confirm delete controls. Files use a signed owner Storage upload, then transition to `quarantined`; filenames and file text never appear in the UI.
- All handler actions pass `context.runPower`; the feature returns unavailable when its power adapter or required dependencies are missing. Read actions are flagged `readOnly`; writes carry explicit confirmation through the host gate.
- Added an unapplied 0070 migration proposal for privacy/tier/revision columns and RLS hardening. No applied migration was edited.
- Added exact LEAD/S00, S22, Antigravity, and S19 change requests in `squads/CR_S09_BUNDLE1_2026-11-22.md`.

## Private-content boundary

- Directly reuse `features/core-workspace/task-manager/src/sensitivity.mjs` `classifySensitivity()`; no new sensitivity classifier was written.
- Also reuse the existing `packages/memory` `classify()` and `findSecrets()` adapters.
- Private categories include the package's health, medicine, money, family, feelings, location, identifiers and other sensitive classes, plus S08 health/credentials/identifiers/uncertain-private indicators. A hit makes the whole record T2/private.
- Password/OTP/PIN/CVV/card/bank/API-secret/identity-secret-like values are refused, not stored.
- A shared-S08-only private memory hit is first checked through the existing `packages/memory` `decide()` policy adapter, then inserted directly as T2 with `tokens=[]`, `pinned=false`; it is never briefly stored as normal/T1 and never reaches a normal event/embedding path.
- T2 entries are omitted from normal list, normal search, normal export and generic UI projections. The private projection contains only `id`, `Private item`, `private` badge, and timestamp metadata.
- File metadata defaults to private; upload completion sets `quarantined`; no file preview/download/extraction/embedding is implemented.
- No cloud or local model call occurs. Anything needing model processing on private text remains **abhi band**.
- S19 Vault encryption is not yet integrated. Until then, T2 is owner-RLS protected and masked in the app, but this bundle does **not** claim ciphertext-at-rest; S19 must provide the vault before any private reveal or file scan/extraction.

## Research reuse decisions

The 73-item research pack is used for ideas only. No upstream code or dependencies were copied/added.

| Squad / feature | Research item | Decision / licence check |
|---|---|---|
| S09 Memory | #1 Honcho — SEEKHO | Research CSV claims Apache-2.0, but upstream `plastic-labs/honcho` currently lists AGPL-3.0. Idea only (profile/conclusion derivation); no code/dependency. A private app can use the product idea, but AGPL obligations make code reuse unsuitable without separate legal approval. |
| S09 Memory | #2 mem0 — SEEKHO | Upstream repository license file verified as Apache-2.0. Use dedupe/conflict-resolution concept only; no code/dependency. Apache-2.0 is permissive for a private app, subject to preserving notice/license if code were ever adopted. |
| S09 Notes-Files | #47 AppFlowy — SEEKHO + REFERENCE | Upstream project lists AGPL-3.0. Use notes/wiki information-architecture ideas only; no code/dependency. AGPL network-use obligations make embedding its code into this private app inappropriate absent legal approval. |
| S09 Projects | #5 Second Brain — SEEKHO | Research labels it “Open Architecture”, not a verified software licence. Use project-to-note linking idea only; no code/dependency until a real licence is confirmed. |
| S05 future History | #4 claude-mem — SEEKHO | Research says MIT; concept only for a later S05 timeline. Not implemented in this bundle and licence not treated as verified. |
| S10 future Insights | #54 Actual Budget — REFERENCE | Research says MIT; local analytics idea only for a later S10 bundle. No code/dependency copied. |
| S10 future Boards | #60 Life Dashboard — PEHLE-SE-ADVANCED | “Open Architecture” is not a verified licence; existing JARVIS/S08 approved cards are the UI reference instead. No code/dependency copied. |

Licence verification sources: Honcho upstream repository, mem0 upstream repository, and AppFlowy upstream repository are linked/cited in the hand-off response. Research-reported stars, benchmarks and adoption counts were not used as proof of quality or safety.

## Security and integration notes

- No changes to `packages/contracts`, `api/`, `vercel.json`, `packages/models`, `packages/model-gateway`, `packages/memory`, app auth, or S22 registry tables.
- LEAD must mount all routes in the existing shared function via rewrites; preserve the existing 12-function Vercel Hobby limit.
- Note create/update need an action-specific 110 KB JSON cap in the shared dispatcher; other S08/S09 actions retain 12 KB. File bytes bypass the function using a signed owner-token Storage PUT.
- LEAD's `runPower` adapter must check S22 registration and kill state for all reads/writes, permit only whitelisted pure reads as L0 observations, audit a fixed one-line reason, and route writes through S08's L2 + confirm `executePower` path. The detailed contract/power seed list is in the CR.
- The storage/db adapters must use owner session bearer + anon key. No service-role key in app code.
- Migration 0070 remains proposal-only; Antigravity applies only after LEAD acceptance and owner isolation/anon-denied tests.

## Changed files

See patch file `JARVIS-S09-Bundle1.patch`. In this repo patch it contains:

- `app/src/App.tsx`
- `app/src/components/Sidebar.tsx`
- `app/src/components/Topbar.tsx`
- `app/src/types.ts`
- `features/core-workspace/memory/KNOWLEDGE.md`
- `features/core-workspace/memory/manifest.json`
- `features/core-workspace/memory/src/api-client.ts`
- `features/core-workspace/memory/src/handler.mjs`
- `features/core-workspace/memory/src/http.mjs`
- `features/core-workspace/memory/src/privacy.mjs`
- `features/core-workspace/memory/tests/handler.test.mjs`
- `features/core-workspace/memory/tests/workspace-migration.test.mjs`
- `features/core-workspace/memory/ui/MemoryWorkspacePage.tsx`
- `features/core-workspace/memory/ui/memory-workspace.css`
- `features/core-workspace/notes-files/KNOWLEDGE.md`
- `features/core-workspace/notes-files/manifest.json`
- `features/core-workspace/notes-files/src/handler.mjs`
- `features/core-workspace/notes-files/tests/handler.test.mjs`
- `features/core-workspace/projects/KNOWLEDGE.md`
- `features/core-workspace/projects/manifest.json`
- `features/core-workspace/projects/src/handler.mjs`
- `features/core-workspace/projects/tests/handler.test.mjs`
- `packages/db/migrations/0070_s09_workspace_private.sql` (proposal only)
- `squads/CR_S09_BUNDLE1_2026-11-22.md`
- `squads/S09_BUNDLE1_REPORT_2026-11-22.md`

No file under `api/` was added. `vercel.json` is unchanged.

## Test evidence

Executed from repo root:

```bash
NODE_OPTIONS=--experimental-strip-types node --test features/core-workspace/memory/tests/*.test.mjs features/core-workspace/notes-files/tests/*.test.mjs features/core-workspace/projects/tests/*.test.mjs
```

P29 delta result in this environment: **15 tests, 15 passed, 0 failed, 0 skipped**. The new handler integration test injects the real `packages/memory` `classify()` / `findSecrets()` exports and covers `metformin lena`, `papa ki bimari`, `password is hunter2`, `OTP 482913`, and normal `doodh lana`. Raw `node --test` without `NODE_OPTIONS` fails on this runner's Node v22.16.0 because it cannot import `.ts`; the repository declares Node >=22.18. This is Node-only feature-handler coverage, not a database/deployment acceptance test.

Repo validation, run with the same Node type-strip compatibility option:
- `NODE_OPTIONS=--experimental-strip-types npm run register` -> `REGISTER OK: 170 units, 0 agent office(s) created, 0 registry file(s) rewritten.`
- `NODE_OPTIONS=--experimental-strip-types npm run check` -> `CHECK PASSED: 170 units, 40 containers (diff rule skipped: pass --base <ref> in CI).`

Also executed `node --check` on `memory/src/privacy.mjs`, `memory/src/http.mjs`, `memory/src/handler.mjs`, `notes-files/src/handler.mjs`, and `projects/src/handler.mjs`; all exited 0 and printed `NODE_CHECKS_OK`.

## Not run / not verified

- `npm ci`: not run.
- Zod / TypeScript app build: not run; this container has Node v22.16.0 while repository `package.json` requires Node >=22.18, and workspace dependencies are not installed here.
- PGlite migration/RLS tests: not run; no PGlite package is installed. Migration SQL has not been executed.
- Browser visual test at 390 px / device emulation: not run. CSS has a 4-column tab grid, `min-width:0`, and wrapping rules, but no claim of browser-verified overflow-free behavior.
- Actual Supabase auth/RLS/storage signed upload, S22 power registry/kill switch, Vercel rewrite/function count, and Antigravity migration: not run.
- S19 encryption/vault and file scanner: not present; do not reveal T2 plaintext or file contents until S19 acceptance.

## Antigravity build prompt

```text
Start from jarvis-repo-P29 with the S09 Bundle 1 patch and its P29 correction delta applied. Read squads/S09_BUNDLE1_REPORT_2026-11-22.md and squads/CR_S09_BUNDLE1_2026-11-22.md first, then the three changed feature KNOWLEDGE.md files, packages/db/KNOWLEDGE.md, packages/db/migrations/0031_workspace.sql, packages/db/migrations/0035_storage_files_policies.sql, and decisions 014/015.

Do not create any api/ file, edit vercel.json, edit packages/contracts, edit an applied migration, or access real Supabase before LEAD acceptance. Implement the exact route rewrites and shared-function action dispatch from CR-1; preserve the existing 12 KB limit except the specified note create/update 110 KB limit. Instantiate all DB/memory/storage adapters with the authenticated owner's session JWT and public anon key, never service role. Confirm that context.db forces owner_id after caller filters.

Register all 25 S09 powers from CR-2 in S22 at L0 defaults/current, max L2, confirm required. Implement the fail-closed read-only observation branch for pure reads and use the S08 executePower/runMutation path for every mutation; audit only fixed why/action metadata, never content, filename, signed URL, or private IDs/values beyond required opaque target IDs.

Keep the S08 shared classifySensitivity() function and packages/memory classifier/secret detector. Verify private memories are policy-preflighted and inserted directly as T2 with no tokens/event/embed path. Keep MemoryService same-store, embedder absent, embeddings off, emit no-op. Keep private entries out of normal list/search/export and return only the generic placeholder + private badge. Raw secrets must be refused. No model call is permitted for private text; any workflow needing a model must stay abhi band.

Apply migration 0070 only after LEAD accepts it. Run SQL syntax and RLS tests: anon denied; owner A cannot read/write owner B; RLS ON and FORCED on projects/notes/files; no private row enters normal queries; no vector/tokens for direct shared-guard private memory. Do not claim tests not run. Run the 15 Node handler tests; then run zod/TypeScript, PGlite, browser 390 px, and deployment tests only on a supported Node >=22.18 environment with dependencies available. Do not deploy or access real Supabase without explicit approval.

Do not implement S19 encryption/scanning in this bundle. Keep private rows masked and all file metadata/content private/quarantined until S19 supplies an accepted vault/scanner contract.
```

## State snapshot

- Target: P29; bundle (1) only — S09 Memory + Notes-Files + Projects.
- Feature handlers/UI: draft implemented inside owned folders; shared route mount is pending LEAD.
- Privacy: shared S08 sensitivity function reused; private rows separated and masked with `private` badge; raw secrets refused.
- Private memory: policy preflight + direct T2 insertion; no normal event/embed path and no model call.
- Files: owner-signed upload path; metadata remains T2/private and `quarantined`; S19 scanner/vault pending.
- Powers: 25 requested, default L0; S22 registration and L2 confirm adapter pending.
- Database: migration 0070 proposal only; not applied; RLS owner tests not run.
- Tests: 15/15 Node handler tests passed with Node type stripping enabled; app build, PGlite, zod, npm ci, 390 px browser and deployment not run.
- Next: LEAD CR review → S22 power seed → Antigravity migration/adapter → S19 vault/scanner; then bundle (2) S05.
