# S09 memory test plan — v1.1.0

## Policy cases

- T1 preference/project/routine/person facts save and appear in default recall.
- T2 direct facts save immediately with `tier='sensitive'` + `private=true`: health, medicine/timing, weight/workout, money numbers, family facts, deep/recurring feelings.
- A weight example (`wazan 72`) is saved as T2 with no age-only expiry.
- `dawai 8 baje` is saved as T2 and produces a typed reminder hand-off; an actual S08 reminder is not asserted unless S08 integration exists.
- Deep/recurring feelings are T2; a passing mood is skipped. Self-harm/abuse always signal care; only an explicit `yaad rakho` stores a generic summary with no methods/plans.
- Inferred T2 asks first; no inference is silently saved.
- Child photo/school address refusal follows accepted Decision 014 until LEAD changes that shared decision.
- T3 credentials and identity numbers are refused even with explicit confirmation; a PAN label alone is enough to refuse and offer the vault-handle path.

## Retrieval / privacy cases

- `card()` and default `recall()` never fetch T2; no boolean `allowPrivate` escape hatch.
- Purpose-scoped recall returns only matching T2 tags for `plan_workout`, `day_status`, `medicine_reminder`, `budget`, or `ask`.
- Purpose-scoped queries do not go to embedding providers; T2 rows never have a vector and cannot receive one through store or DB.
- T2 writes do not emit general memory events; usage updates carry row IDs/counts only, no memory text.
- User B cannot read/search/update/delete User A's T2 rows; test through PGlite/RLS and the in-memory store contract.
- T2 stays outside the ordinary GIN keyword index; purpose-scoped keyword filtering is database-enforced.

## History growth

- User-stated T2 history has no age-only expiry.
- Compaction considers only old workout/weight fact/episode rows; it must store a private summary before hard-deleting selected source rows. Medicine/family/money/emotion/location/milestones and recent records stay.
- Without a private summarizer or with kill switch on, compaction does nothing.
- Compaction is a hook only; worker schedule and approved private summarizer are not part of this S09 bundle.

## Existing suite / environment

Run from repo root:

```sh
npm i
npm i -D @electric-sql/pglite@0.2.17
cd packages/memory && node --test tests/*.test.ts tests/*.test.mjs
cd ../..
npm run register
npm run check
node scripts/test-all.mjs
```

The repo's baseline notes one unrelated pre-existing `packages/db` test failure. Do not change that package to hide it. Real Supabase is NOT used by this test plan.
