SQUAD: S09 MEMORY+KNOWLEDGE (Round 2)
STATUS: PARTIAL

WHAT IS READY:
- `self/identity/memory-behaviour.md` -> v1.1.0: T1/T2/T3 rules aligned to Amit's answers, direct T2 save, temporary-vs-deep feelings, crisis-care rule, medicine name+time display, explicit one-off location save, no age-only expiry for Amit-stated weight/workout history.
- T2-aware policy/classification/redaction: `packages/memory/src/classify.ts`, `policy.ts`, `redact.ts`.
- Typed tier/purpose model and store contracts: `packages/memory/src/types.ts`, `store.ts`, `memory-store.ts`, `supabase-store.ts`, `testing/contract.ts`.
- Purpose-gated recall, default T1-only reads, no T2 vectors, metadata-only use/events, medicine reminder hand-off, and guarded history compaction hook: `packages/memory/src/service.ts`, `embed.ts`.
- Additive migration `packages/db/migrations/0033_memory_tiers_and_purpose.sql`. Migrations 0021 and 0030-0032 are unchanged. Migration 0033 has NOT been applied to any database.
- Tests updated/added: `packages/memory/tests/rules.test.ts`, `service.test.ts`, `supabase.test.ts`, `sql-static.test.mjs`, `db-rls.test.mjs`.
- Package docs: `packages/memory/docs/SENSITIVE_ENCRYPTION_PLAN.md`, `CHAT_INTERFACE.md`, `TEST_PLAN.md`, `CONTRACT_REQUESTS.md`, plus `packages/memory/KNOWLEDGE.md` and `manifest.json`.
- Registry refreshed by the requested register command: `self/registry/knowledge-index.json`, `self/registry/units.json`.
- S09 test suite using Node type stripping: 84 tests, 82 pass, 0 fail, 2 skipped (both need PGlite). The exact requested test command was also run without type stripping and failed because installed Node is v22.16.0 and does not load `.ts` tests directly.
- The repo does not contain `docs/decisions/014-memory-friend-tiers.md`; I used the accepted copy from Team Pack 14 at its root. This path mismatch is not silently repaired.

CONTRACTS I DEFINE:
- `MemoryTier = 'normal' | 'sensitive'`; `private` remains a backwards-compatible mirror of T2. T3 is refused before storage; it is not a database tier.
- `MemoryPurpose = 'plan_workout' | 'day_status' | 'medicine_reminder' | 'budget' | 'ask'`.
- `recall(query, { purpose })`: omitted purpose means T1 only. T2 is considered only for an explicit allowed purpose, and only for matching tags. `ask` is used when Amit explicitly asks JARVIS to recall a private fact.
- T2 rows are excluded from default card/search, event payloads, general keyword index and vector embedding. T2 usage emits no text; metadata is limited to IDs/counts.
- Medicine reminder hand-off is a typed request carrying the medicine label and time, including `display_text` for the chosen lock-screen display. S09 does not create or schedule the actual reminder; S08 must connect the callback.
- Migration `0033` drops the old boolean `p_allow_private` search RPC and replaces it with `p_purpose`; callers must migrate together.

NEEDS FROM OTHER SQUADS:
- **CONTRACT REQUEST — S00/LEAD:** review migration 0033 and the `memory_search(..., p_purpose, ...)` RPC signature; approve a staging/local migration test before any real Supabase work.
- **CONTRACT REQUEST — S08:** consume `MedicineReminderRequest`; display medicine name + time on lock screen as Amit selected. Reminder is only a hand-off at present, not a live notification.
- **CONTRACT REQUEST — S19:** implement server-side envelope encryption at rest for T2 using the plan in `packages/memory/docs/SENSITIVE_ENCRYPTION_PLAN.md`; the plan is documentation only, and 0033 does NOT encrypt data at rest.
- **CONTRACT REQUEST — S21:** align persona/care language with v1.1.0. S21-owned persona files were not edited.
- **CONTRACT REQUEST — S22/S13:** provide an approved private summarizer and scheduled worker for the compaction hook. No scheduled compaction is live yet.
- **CONTRACT REQUEST — LEAD:** accepted Decision 014 explicitly refuses a child's photo and school address. Amit asked for explicit-command exceptions for family assets; S09 kept the accepted 014 refusal and recorded the conflict rather than silently changing the shared decision. No current child/family asset exception is implemented.
- Location monitoring/tracking is outside S09. Memory supports only an explicit one-off location memory; it does not implement live tracking or background collection.

DECISIONS TAKEN (with reason):
- Medicine name AND time are visible in the reminder display (`Metformin — 8:00 PM`), because Amit selected the named display option.
- Amit-stated weight/workout history has no age-only expiry. Historical details may be compacted only after a private summary is safely created; major milestones, trends and non-workout T2 categories are excluded from the compaction candidate set.
- Automatic compaction is a guarded hook only: it needs a private summarizer injected by its owning squad and considers workout/fitness/weight episodes older than 365 days. It is NOT scheduled or active automatically yet. This preserves the intent without pretending a worker exists.
- Temporary feelings are skipped; deep/recurring feelings become T2. JARVIS inference asks first. No diagnosis/personality label is generated by this memory policy.
- Health, medicine/time, weight/workout, money figures, family facts and family health details are T2. Direct facts Amit supplies are saved privately without a lecture. Inferred T2 asks first.
- Self-harm/abuse always sets a care signal. A short generic summary is saved only on explicit “yaad rakho”; methods, plans and instructions are never saved.
- Raw credentials and identity numbers (password, OTP, CVV, PIN, card/bank number, Aadhaar/PAN/passport number, API keys) are T3 and refused. User-facing response tells Amit to delete the message and rotate the key/password when relevant. Vault reference is only `{{secret:naam}}`; actual vault is S19 work.
- Model learning means retrieval/profile/pattern summaries, not automatic retraining or changing the base model weights.
- No secrets, real user memory data, real Supabase credentials or user records were added to the repository.

OPEN QUESTIONS FOR AMIT:
- None blocking S09 code. The family-photo/school-address exception is a LEAD/Decision-014 contract question, not an extra question for Amit in this round.

ANTIGRAVITY BUILD PROMPT:
```text
Work only from this accepted S09 Round 2 bundle and branch `squad/S09-memory`.
First read `squads/S09_ROUND2_REPORT.md`, `squads/S09_ROUND2_STATE_SNAPSHOT.md`, `packages/memory/docs/CONTRACT_REQUESTS.md`, `self/identity/memory-behaviour.md` v1.1.0, and migration 0033.
Use Node >=22.18 as required by package.json. Install dependencies only when network is available; the S09 PGlite tests need @electric-sql/pglite@0.2.17. Run the exact S09 memory tests, then the PGlite RLS test after dependency install. Verify user B cannot read/change user A's T2 and that T2 never has an embedding.
Do not run any migration on real Supabase. Do not edit migrations 0021 or 0030-0032, root shared docs/contracts, MASTER_CONTEXT, or S21 persona files. Do not weaken/remove tests. Do not enable remote embeddings or send T2 data to a model API. Do not implement background location tracking.
Route migration/RPC changes through S00/LEAD, reminder creation through S08, at-rest encryption through S19, persona alignment through S21, and scheduled private compaction through S22/S13. Keep the child-photo/school-address rule from accepted Decision 014 until LEAD approves a contract change.
Return a fresh test report with exact command output and NOT RUN reasons. No real Supabase work without explicit LEAD approval.
```

NEXT STEP I RECOMMEND:
- LEAD reviews this patch and the 0033 RPC contract. Then install PGlite on a Node >=22.18 environment and run the skipped database/RLS tests against a local disposable database. In parallel, S08/S19 can consume their hand-off documents; do not claim reminder scheduling or at-rest encryption complete until those squads integrate them.

TEST & COMMAND EVIDENCE (executed in this session; outputs shown as emitted):
- `npm i`
  - `npm warn EBADENGINE ... required: { node: '>=22.18' } ... current: { node: 'v22.16.0' ... }`
  - `up to date, audited 1 package in 236ms`
  - `found 0 vulnerabilities`
- `npm i -D @electric-sql/pglite@0.2.17 --fetch-timeout=15000 --fetch-retries=0`
  - `npm error code EAI_AGAIN`
  - `npm error syscall getaddrinfo`
  - `npm error request to https://registry.npmjs.org/@electric-sql%2fpglite failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org`
- `cd packages/memory && node --test tests/*.test.ts tests/*.test.mjs`
  - `# tests 15`
  - `# pass 9`
  - `# fail 4`
  - `# skipped 2`
  - The four failures are Node v22.16.0 `ERR_UNKNOWN_FILE_EXTENSION` for the `.ts` test files; the two database tests report `# SKIP pglite not installed`.
- `cd packages/memory && node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs`
  - `# tests 84`
  - `# pass 82`
  - `# fail 0`
  - `# skipped 2`
  - `# todo 0`
- `npm run register`
  - Exact command without the type-strip flag: failed with `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` for `scripts/register.ts`.
- `NODE_OPTIONS=--experimental-strip-types npm run register`
  - `REGISTER OK: 166 units, 0 agent office(s) created, 2 registry file(s) rewritten.`
- `npm run check`
  - Exact command without the type-strip flag: failed with `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` for `scripts/check.ts`.
- `NODE_OPTIONS=--experimental-strip-types npm run check`
  - `CHECK PASSED: 166 units, 40 containers (diff rule skipped: pass --base <ref> in CI).`
- `NODE_OPTIONS=--experimental-strip-types node scripts/test-all.mjs packages/memory`
  - `PASS  packages/memory          82 passed, 0 failed`
  - `ALL PASSED: 82 tests in 1 packages`
- `node scripts/test-all.mjs`
  - Ran without type stripping; the runner exited non-zero because Node v22.16.0 cannot load the repo's `.ts` test files, and PGlite was absent.
- `NODE_OPTIONS=--experimental-strip-types node scripts/test-all.mjs`
  - `7 PACKAGE(S) FAILED: 239 tests in 15 packages`
  - S09 `packages/memory` passed (82, 0 failed, 2 skipped). Other package failures are external to S09 and due missing workspace dependencies (`zod`, `zod-to-json-schema`) and missing PGlite; `worker/jobs` had 7 pass and its PGlite test could not load. `packages/db`'s 9 static tests passed, then its PGlite runner failed to import PGlite.
- `packages/db` known pre-existing issue from `LEAD_REVIEW_S09.md`: the jobs/claim_job test section has historically failed with `permission denied for table system_state` after `reset role`, before this S09 round. It was not changed. This failure could not be independently reproduced in this run because PGlite could not be installed.

NOT RUN / NOT VERIFIED:
- PGlite-backed S09 database/RLS tests: skipped because `@electric-sql/pglite@0.2.17` could not be downloaded (`EAI_AGAIN`).
- Migration 0033 execution against local Postgres/PGlite or real Supabase: NOT RUN. No real Supabase was accessed.
- S08 actual reminder creation/lock-screen delivery: NOT RUN; S09 only provides a typed hand-off.
- S19 at-rest encryption and real vault storage: NOT RUN; only the encryption integration plan and `{{secret:naam}}` route are documented.
- Scheduled automatic compaction: NOT RUN; no private summarizer or scheduled worker is connected.
- Full repo test suite is not green in this environment; see the exact runner summary and missing dependency reasons above. No unrelated package was modified to force it green.
