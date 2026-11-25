# live-activity
STATUS: built
WHAT IT IS: Home Live Activity card showing the current high-level state of JARVIS background jobs and device commands.
WHAT IT CAN DO:
- (built) Read bounded queued/running metadata from existing `jobs` and `phone_commands` rows.
- (built) Show fixed allowlisted labels and statuses without exposing payloads, command JSON, results, errors, device names or lock metadata.
- (built) Offer a stop intent only for explicitly cancellable work; actual cancellation requires a separate confirmed L2 power.
WHAT IT CANNOT DO / LIMITS:
- Cannot invent progress percentages; absent progress is displayed as indeterminate.
- Cannot execute, cancel, retry or create jobs outside the shared power gate.
- Does not add a Realtime publication, event, API function, table, migration or dependency.
HOW IT WORKS: LEAD mounts the plain feature handler in existing `api/tasks/index.ts`, injecting owner-scoped metadata-only readers, stop adapter and `executePower`. The UI receives safe DTOs only and dispatches stop through the shell callback after confirmation.
INPUTS / OUTPUTS: Input: owner-scoped job/phone-command metadata. Output: max 5 safe entries `{id, label, state, created_at, source, can_stop}`. Existing tables: `jobs`, `phone_commands`.
USES / USED BY: Uses `api.tasks`; used by Home shell, worker/jobs and S16 device command integration.
POWER LEVEL & CONFIRMATION: `home.live-activity.read` starts L0; `home.live-activity.stop` starts L0, max L2, needs explicit confirmation. Kill switch unreadable/ON or missing audit/power registration blocks action.
EXAMPLES: Show “Researching the web — Running”; show “Phone action — Queued”; stop a cancellable task only after confirmation.
KNOWN ISSUES: Live updates depend on existing bounded polling/refresh integration; no browser polling timer or Realtime channel is introduced by this feature module.
CHANGE LOG:
- 2026-11-23 - P29 bundle (2) implemented feature-local UI, guarded handler and Node tests; no API/schema/app-shell edits - version 0.1.0.
- (append-only) 2026-11-23 - P29 Folder-First specification for metadata-only live status and confirmed stop intent - version 0.0.2.
