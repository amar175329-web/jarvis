# Implementation Plan - build order (living doc)
STATUS: DRAFT v0.1 | OWNER: LEAD | UPDATED: 2026-11-10
Rule: a squad works on its own branch squad/<id>; LEAD verifies by running; Antigravity merges. One step at a time.

## Done
S00 foundation (~80%), S21 persona/voice core (~70%), S22 brain (accepted, not wired).
## Now
1. Antigravity bundle: apply part9 + S22 accepted repo to main; run 0005 and 0020 on a branch DB; fix db test; wire gate() into harness/permissions and kill state from safety.
2. S09 memory (migrations 0030s) - in parallel with step 1.
3. S00 leftovers via GPT: backup, registry-builder, test:all coverage, real password login.
## Next (Phase 1)
S07 chat -> S16A + S16B (phone) -> S08 -> S05, S06, S01, S02, S03.
## Later
Phase 2: S04, S10-S15. Phase 3: S17-S19 (S19 = security work, see SECURITY_CHECKLIST.md). S20 QA last.
## Definition of done (every squad)
folder + KNOWLEDGE.md + manifest; tests pass in test:all; npm run check passes; REPORT in squad format; no secrets; no real-Supabase changes without LEAD.
