# LEAD review: S09 MEMORY (2026-11-11) - ACCEPTED with LEAD fixes

## Verified by running
- Full test:all on the merged tree: 15 packages, 336 tests, all pass except packages/db (see Open 1). packages/memory 78/78 including the 2 DB tests S09 could not run.
- Migrations 0001-0005, 0020, 0021, 0030-0032 apply in order on local Postgres (pglite 0.2.17 + pgvector). halfvec(768) works there.
- "User B cannot see or change A" passes on memories, projects, notes, files, memory_links, memory_declines and on memory_search / memory_forget.
- npm run register + check PASS (166 units).

## LEAD fixes
1. S09's DB test harness never reached 0030: no pg_cron stub, auth.users had no created_at, users were inserted after 0020. Fixed in tests/db-rls.test.mjs.
2. DB test expected a trigger to null embeddings on private rows; the DB actually REFUSES (check constraint memories_private_no_vector_chk), which is stronger. Test now asserts the refusal. Note for S09/Antigravity: the embedding job must skip private rows, or it will error.
3. Decision numbering: my earlier "011-big-memory-growth" clashed with 011-home-news-owner. Now docs/decisions/013-big-memory-growth.md (S09's thresholds: warn 320 MB / 24k / p95 400 ms; alarm 400 MB / 30k / 3 probes >= 700 ms).
4. CR-2 accepted: events memory.updated, memory.forgotten, memory.exported (metadata only).
5. CR-4 accepted as migration 0021 (+ seed): powers.tags column (fixes the S22 gap), memory.forget default L2, new memory.forget-all (L0, app tap only), memory.write-private (L2), memory.export (L2). 80 powers, brain tests updated.
6. CR-7 accepted (packages/memory). CR-8/CR-9 done: rows added to docs/BACKEND_SCHEMA.md and docs/SECURITY_CHECKLIST.md.
7. Honcho license is AGPL-3.0 (S22's map said Apache-2.0: wrong). No code was copied. Noted in packages/memory/docs/LEARNED_FROM.md.

## Open
1. packages/db db.test.mjs: 65 PASS then "permission denied for table system_state" at the jobs section (test line ~89, `delete from system_state` after `reset role`). Same on pglite 0.2.17 and 0.3.14, and before S09 and S22: so it is the jobs/claim_job tests (0004) that have never passed. Antigravity to fix the harness or the ACL and confirm claim_job fail-closed.
2. Embeddings: free Gemini terms (checked 2026-11-11 via a secondary source dated Oct 2024; re-check the official page): Google may use unpaid-service data and humans may read it; paid services: not used. LEAD recommendation to Amit: NO for now. Vector search stays OFF, word-search works.
3. CR-1 gateway embed(), CR-3 routes, CR-5 jobs: not done. embed() waits for Amit's answer and a paid-tier or local model.
4. Migrations never run on a real Supabase. Test project first (Antigravity).
5. Decisions 007 and 012 are both "worker host" (012 supersedes 007 in part): merge later.
