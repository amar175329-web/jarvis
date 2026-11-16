# STATE SNAPSHOT — S09 MEMORY+KNOWLEDGE Round 2

- Branch: `squad/S09-memory`
- Status: PARTIAL; S09 implementation and unit/service/static tests are ready for LEAD review.
- Behavior spec: `self/identity/memory-behaviour.md` v1.1.0.
- Tiering: T1 normal; T2 private/sensitive; T3 raw secrets refused (not stored).
- T2 retrieval: purpose required; default recall/card/search stays T1-only; T2 embeddings/vectors disabled.
- Allowed purposes: `plan_workout`, `day_status`, `medicine_reminder`, `budget`, `ask`.
- Reminder: medicine name + time preserved for the lock-screen display request; S08 creation remains a hand-off.
- Retention: no age-only expiry for Amit-stated weight/workout history; safe compaction hook exists but is not scheduled/active.
- Tests: memory package 82 pass, 0 fail, 2 PGlite skips using `--experimental-strip-types`.
- Environment blocker: Node v22.16.0 vs required >=22.18; PGlite npm install failed with DNS `EAI_AGAIN`.
- Database: migration 0033 created but NOT applied anywhere. No real Supabase access.
- Pending contracts: S00/LEAD review 0033; S08 reminder adapter; S19 encryption/vault; S21 persona alignment; S22/S13 private compaction job.
- Decision conflict: accepted Decision 014 currently refuses child photo/school address. Amit asked for an explicit-command exception; S09 left refusal intact and logged a LEAD contract request.
- No live location tracking is implemented in S09; only explicit one-off location memory is in policy scope.
- Root shared `docs/`, contracts, MASTER_CONTEXT, and migrations 0021/0030-0032 were not changed.
- Known pre-existing DB test issue documented in `LEAD_REVIEW_S09.md` remains untouched.

## Next hand-off
LEAD reviews patch/report, then re-runs PGlite RLS/migration tests in Node >=22.18 with dependencies available. No real Supabase migration without explicit approval.
