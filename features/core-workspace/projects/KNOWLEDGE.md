# projects
STATUS: broken
WHAT IT IS: S09 owner-only projects workspace draft with goal, status, next step, due date, tags and links to notes, files, memory and tasks.
WHAT IT CAN DO:
- Create, list, update and delete project records through the owner-scoped handler.
- Connect project, note, file and task records using the existing `memory_links` relation without changing S08 task schema.
- Segregate sensitive projects and show only a generic `Private item` with a `private` badge.
WHAT IT CANNOT DO / LIMITS:
- This is not built for production. LEAD shared-function mounting, S22 registered powers and Antigravity migration/RLS acceptance remain pending.
- It does not create Gantt or board views; those remain S10 scope.
- Decision 014 and Decision 015 are policy references, not registry unit IDs. S22 registered powers are requested through a change request, not linked in the manifest.
HOW IT WORKS:
- Project fields are classified with S08 `classifySensitivity()` plus the existing `packages/memory` classifier and secret detector supplied to the privacy adapter.
- Sensitive records are stored as T2/no-embed and returned as metadata-only placeholders. The migration 0070 file is proposal-only until LEAD accepts it and Antigravity applies it.
- The API handler is a plain module mounted by LEAD inside the existing shared function with owner bearer/RLS context; no new `api/` file is added.
INPUTS / OUTPUTS: Input: owner project details and relation endpoints. Output: normal project records or metadata-only private placeholders with linked-record counts.
USES / USED BY: Uses registry units `packages.memory` and `features.core-workspace.memory`; `memory.graph` is the registered relationship/knowledge unit. Used by Notes-Files and S08 task linking after acceptance.
POWER LEVEL & CONFIRMATION: L0 owner screen; every mutating action requires its registered S22 power, owner confirmation where risky, a one-line audit why, and fail-closed kill-switch handling.
EXAMPLES: A project with a family-sensitive goal is returned as a private placeholder rather than exposing its name or goal.
KNOWN ISSUES: Status remains `broken`, not `built`: implementation files exist but production integration and migration acceptance are incomplete. S22 powers and Decision 014/015 are prose-only references, not registry IDs.
CHANGE LOG:
- 2026-11-22: Initial S09 bundle draft added; project privacy and link behavior recorded.
- 2026-11-23: P29 delta: remove non-unit manifest links and align knowledge headings/status with repository validation.
