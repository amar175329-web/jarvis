# harness
STATUS: built
WHAT IT IS: JARVIS runtime permissions enforcement (gate check before every power, safety kill state translation).
WHAT IT CAN DO:
- Checks permissions before power execution using brain's gate() policy
- Reads kill switch state from safety and passes to gate fail-closed
- Enforces L0-L4 autonomy and confirmation rules (e.g. memory.forget at L2)
- Rejects unknown powers fail-closed
WHAT IT CANNOT DO / LIMITS:
- Does not execute the power itself; enforcement only.
- Full runtime loop, tool-runner, and sessions are planned for Phase 1 (S07).
HOW IT WORKS:
- checkPowerPermission reads kill switch state from safety store (fail-closed if missing or error).
- Translates kill status to 'on', 'off', or 'unreadable'.
- Invokes brain gate(reg, powerId, killState) and returns GateResult (allow, mode, level, reason).
INPUTS / OUTPUTS:
- Inputs: Registry, powerId (string), KillSwitchStore, ownerId (UUID).
- Outputs: GateResult ({ allow: boolean, mode: Mode, level: Level | null, reason: string }).
USES / USED BY:
- USES: packages.brain, packages.safety
- USED BY: packages.harness, acting squads / runtime
POWER LEVEL & CONFIRMATION: L1 (provisional; S22 sets the final level).
EXAMPLES:
- checkPowerPermission(reg, 'browser.read-page', store, owner) -> allow: true, mode: 'act_then_tell', level: 3
- checkPowerPermission(reg, 'memory.forget', store, owner) -> allow: true, mode: 'ask_confirm', level: 2
- checkPowerPermission(reg, 'any.power', killedStore, owner) -> allow: false, mode: 'deny', reason: 'kill switch is ON'
KNOWN ISSUES: None known.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S07.
- 2026-11-11 - wired brain gate() and safety kill switch into harness/permissions (checkPowerPermission), 7 tests pass - 0.1.0
