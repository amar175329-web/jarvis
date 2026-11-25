# memory
STATUS: broken
WHAT IT IS: S09 Memory workspace draft. It separates ordinary T1 entries from private T2 entries and uses the existing packages.memory policy, classifier and secret detector.
WHAT IT CAN DO:
- Keep normal memory entries in the normal response and show private entries only as a generic `Private item` with a `private` badge.
- Reject raw passwords, OTPs, identity numbers, payment secrets and API credentials before persistence.
- Route every handler action through the registered power adapter; a missing power gate fails closed.
WHAT IT CANNOT DO / LIMITS:
- This is not a built or production-ready feature. LEAD has not mounted the handlers, S22 power seeds are not accepted, and migration 0070 is still only a proposal.
- S19 Vault encryption is not present. Private plaintext stays owner-scoped and masked; no model call, embedding, preview or normal-list projection is allowed.
- Decision 014 and Decision 015 are policy references, not registry unit IDs. S22 registered powers are a pending change request, not a registry link.
HOW IT WORKS:
- `src/handler.mjs` delegates content checks to `src/privacy.mjs`. That module reuses S08 `classifySensitivity()` and receives `classifyMemoryText` / `findMemorySecrets` adapters from the real `packages/memory/src/classify.ts` and `packages/memory/src/redact.ts` exports.
- Shared-guard private content is policy-checked and written directly as T2 with `tokens: []`; raw secrets are refused. Private outputs contain only a generic placeholder.
- LEAD must mount the plain handler in the existing shared API function with owner session, user bearer/RLS context and registered powers. No new `api/` route is added.
INPUTS / OUTPUTS: Input: owner-scoped memory actions and content. Output: normal memory records or metadata-only private placeholders; no private plaintext in list/export output.
USES / USED BY: Uses registry units `packages.memory`, `features.core-workspace.task-manager`, `memory.rules` and `memory.engine`. Used by Amit through the app shell after LEAD accepts integration.
POWER LEVEL & CONFIRMATION: L0 owner screen; actions require the registered memory powers, owner confirmation for risky operations, an audit why-line, and a fail-closed kill switch.
EXAMPLES: `memory.list` returns ordinary rows separately from private placeholders; `password is hunter2` and `OTP 482913` are refused.
KNOWN ISSUES: Status is `broken` rather than `built` or `planned` because handler/UI/test files are present but the feature is not accepted or mounted; the repository check forbids extra files in a `planned` unit. Decision 014/015 references and S22 power requirements are descriptive text only, not manifest links.
CHANGE LOG:
- 2026-11-22: Initial S09 bundle draft added; private output boundary and T2 no-embed path recorded.
- 2026-11-23: P29 delta: replace invalid manifest links; use only registered unit IDs; add real packages/memory detector integration coverage; remain unaccepted pending LEAD/S22/Antigravity integration.
