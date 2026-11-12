# harness
STATUS: built
WHAT IT IS: JARVIS runtime permissions enforcement and single-path executor (gate check before every power, safety kill state translation, decision logging).
WHAT IT CAN DO:
- Checks permissions before power execution using brain's gate() policy
- Reads kill switch state from safety and passes to gate fail-closed
- Single entrypoint executePower(powerId, run) guarantees no power runs without gate evaluation
- Enforces L0-L4 autonomy and confirmation rules (kill ON stops run; unreadable stops run; L2 requires confirmation)
- Emits decision log entry after power evaluation or run
- Rejects unknown powers fail-closed
WHAT IT CANNOT DO / LIMITS:
- Does not persist decision logs to database yet; emits in-memory callback (S07/S19 will wire audit table).
- Full runtime agent loop, tool-runner, and sessions are planned for Phase 1 (S07).
HOW IT WORKS:
- checkPowerPermission reads kill switch state from safety store (fail-closed if missing or error), translates to 'on' | 'off' | 'unreadable', and calls gate().
- executePower coordinates kill switch reading, gate checking, confirmation verification (for L2 ask_confirm), invokes run(), measures duration, and invokes onDecisionLog callback.
INPUTS / OUTPUTS:
- Inputs: Registry, powerId (string), KillSwitchStore, ownerId (UUID), confirmed (boolean), run (function), onDecisionLog (callback).
- Outputs: ExecutePowerResult ({ executed: boolean, gate: GateResult, result?: T, error?: Error, decisionLog: DecisionLogEntry }).
USES / USED BY:
- USES: packages.brain, packages.safety
- USED BY: packages.harness, acting squads / runtime
POWER LEVEL & CONFIRMATION: L1 (provisional; S22 sets the final level).
EXAMPLES:
- executePower({ reg, powerId: 'terminal-strip.display', store, ownerId, run }) -> executed: true, result: ...
- executePower({ reg, powerId: 'memory.forget', store, ownerId, confirmed: false, run }) -> executed: false, error: 'L2 power requires explicit confirmation'
- executePower({ reg, powerId: 'any.power', store: killedStore, ownerId, run }) -> executed: false, gate.mode: 'deny'
KNOWN ISSUES: None known.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S07.
- 2026-11-11 - wired brain gate() and safety kill switch into harness/permissions (checkPowerPermission), 7 tests pass - 0.1.0
- 2026-11-12 - added executePower single execution path with gate evaluation, fail-closed kill/unreadable checks, L2 confirmation gate, decision logging (14 tests pass) - 0.2.0
- 2026-11-12 - fixed executor logging bug: isolated onDecisionLog in try/catch so logging failure never masks run() success or throws unhandled exception; added logError capture (16 tests pass) - 0.2.1
