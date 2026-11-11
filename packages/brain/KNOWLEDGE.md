# brain
STATUS: built (bundles 1 and 2 done; 65 tests; not wired to DB/model yet)
WHAT IT IS: S22 policy for how JARVIS thinks and uses powers. It decides; it does not execute. Enforcement = harness/permissions. Kill switch + audit = safety/.
WHAT IT CAN DO:
- levels.ts: L0-L4 only. (L0 observe, L1 suggest, L2 act after confirm, L3 act then tell, L4 silent safe+reversible)
- power-registry.ts: validates powers (same rules as DB: id pattern, current<=max, dangerous<=L2, L4 only reversible). newPlugPower() makes a safe new power starting at L0.
- gate.ts: the one gate. Kill ON/unreadable => deny. Unknown power => deny. Otherwise returns mode (observe/suggest/ask_confirm/act_then_tell/act_silent).
- depth-router.ts: FAST / NORMAL / DEEP by rules (no model call), with tunable budgets.
- confirm-wording.ts: wording per level; voice yes only "हाँ / कर दो / भेज दो"; silence never yes; money/health/password confirm by phone voice; money/health/password/vault = voice yes, then owner fingerprint.
- owner-credential.ts: owner fingerprint policy (enrol once in owner login, never deleted, extra ones need owner verify).
- loop.ts: the standard loop with ports; web/screen/message text is data and never starts an action; kill re-checked just before acting.
WHAT IT CANNOT DO / LIMITS:
- Does not run any power itself. Does not read the kill switch itself (safety/ does; brain only receives the state).
- Planner, uncertainty, proactivity, explainability, contracts and 20+ QA scenarios are bundle 2 (not built).
- Depth budgets are starting values, to tune with S07/S13.
- A new squad MUST call gate() before acting; brain cannot force it. Harness/permissions enforces.
HOW IT WORKS: ports interface in loop.ts. powers.seed.json (80 powers) mirrors migrations 0020 + 0021 (0021 adds tags column and 3 memory powers; not run on real Supabase).
INPUTS / OUTPUTS: gate(registry, powerId, killState) -> {allow, mode, level, reason}. route({text,...}) -> {depth, reason, budget}.
USES / USED BY: used by S07, S16B, S12, S14, S15 (everyone who acts).
POWER LEVEL & CONFIRMATION: L0. The brain package itself never acts.
EXAMPLES: see tests/brain.test.ts (39 cases, all passing with node --test).
KNOWN ISSUES: Laya (fast model) not used; rules router first. Password/finance apps max L1 per Amit; payment frozen at L0 until Amit unlocks.
CHANGE LOG:
- 0.1.0 bundle 1: loop, router, registry, gate, wording, seed, migration proposal 0020. Owner S22.

- 2026-11-09 - LEAD: status/links fixed for `npm run check`; added package.json so tests run in test:all.
