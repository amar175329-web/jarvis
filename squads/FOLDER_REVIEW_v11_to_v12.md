# Folder Structure review: v11 -> v12 (LEAD-A)
VERDICT: v11 is a strong base (manifest-driven, one home per thing, status ladder, truth rules, kill switch). It will hold for future features IF the fixes below are applied. Nothing needs to be thrown away.

## MUST FIX (blocks correctness)
1. DATABASE: resolved. v11's database tab is dropped; the database is Supabase (Postgres/Auth/Realtime), see docs/decisions/001. One Postgres to start; add a second store only when a measured need appears.
2. Levels. Amit decided: ONLY L0-L4, no low/medium/high. FIX: manifest has one field "autonomy_default": L0..L4 (the old "risk" field is removed). Dangerous powers are simply capped at L0-L2.
3. Memory data. Amit clarified memory/ folders are only for ORGANISING memory (categories), not for GitHub. OK: keep memory/ folders as categories. Rule: personal memory data is always .gitignored and never pushed. Note: Vercel has no permanent disk, so the live data sits in the database; the folders are the organisation/export view.
4. Permissions in 3 places (brain/, harness/permissions, safety). FIX, one owner each: brain/ = the policy data (S22), harness/permissions = enforcement reading brain/, safety/ = kill switch + audit log only.

## SHOULD ADD
5. packages/shared/ - types shared by app, api, worker and the Kotlin app. contracts/generated/ - TS + Kotlin types generated from contracts, so Android and web never drift.
6. contracts/manifest-schema/ - the ONE schema every manifest.json is validated against.
7. docs/decisions/ - one short file per big decision (what chosen, why). Prevents agents re-arguing old choices.
8. Manifest extra fields: owner_squad, phase (1/2/3), autonomy_default. Lets LEAD track ownership from the registry.
9. Status ladder: add "deprecated" (planned -> built -> tested -> live | broken | deprecated).
10. Route naming: v11 uses /api/<group>/<action> (e.g. /api/customize/skills.list); MASTER_CONTEXT said /api/<squad>/<action>. DECISION: group-based wins (squads are temporary, groups are permanent). MASTER_CONTEXT updated.
11. Language rule: rules and agent-facing files (AGENTS.md, rules/, KNOWLEDGE.md headings) in English; Hindi/Hinglish allowed in explanations. Agents follow English rules more reliably.
12. FOLDER-FIRST RULE (new, mandatory) - see FOLDER_FIRST_RULE.md. KNOWLEDGE.md replaces README.md.

## KEEP AS IS (good)
6 layers; library = the thing / features = its screen; command-center vs library/agents split; discovery -> approval -> register flow; truth-rules + ledger + evals/self-truth; presence (one JARVIS at a time); recipes + apps + resolver ladder.

## WATCH-OUTS (no change now)
- Do not pre-create empty subfolders for all 80+ planned features. Only folder + manifest + KNOWLEDGE.md until real code.
- Name clashes (features/customize/skills vs library/skills) are intentional: screen vs thing. Rule: never put logic in features/ that belongs in library/ or packages/.
- machine-agent / terminal-hub are powerful: Phase 3, behind S22 policy and the kill switch.

## DIFF against v11 (add / remove / rename)
ADD  packages/shared/ ; contracts/generated/ ; contracts/manifest-schema/ ; docs/decisions/ ; FOLDER_FIRST_RULE.md (root + command-center/rules/) ; KNOWLEDGE.md in every feature/library/package folder ; manifest fields owner_squad, phase, autonomy_default ; status "deprecated"
RENAME README.md -> KNOWLEDGE.md (all feature, library, agent folders)
CHANGE manifest: remove "risk", keep autonomy_default L0-L4 ; memory/ data always gitignored ; safety/ = kill switch + audit only ; harness/permissions = enforcement of brain/ policy
DECIDED database = Supabase
REMOVE nothing
