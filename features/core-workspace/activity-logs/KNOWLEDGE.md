# activity-logs
STATUS: built
WHAT IT IS: S05 ka unified, owner-scoped activity log (who / what / when / result). Existing `public.activity_log` table is the source; no duplicate log table is created.
WHAT IT CAN DO:
- (built) Provide `logActivity()` for squads to record a small, allow-listed metadata row after the originating action passes its registered power gate.
- (built) Provide `activity-logs.list` as a read-only owner endpoint with action, actor, outcome and before filters.
- (built) Redact health, medicine, finance, family, emotion, location and secret-bearing text using S08 shared `classifySensitivity()` plus S09's real memory `classify()` / `findSecrets()` helpers.
- (built) Render a responsive Activity Logs panel with local search, actor/result filters and who/what/when/result details.
WHAT IT CANNOT DO / LIMITS:
- No content search over raw messages, notes, files or private detail.
- No model calls, no raw user text in audit metadata, no service-role key, no direct API function, and no delete/export action.
- Private values are replaced before logging and again before display. Existing historic rows are redacted on read; this does not rewrite old DB rows.
HOW IT WORKS: `src/privacy.ts` combines the approved S08 classifier with the maintained S09 memory classifier and secret detector. `src/log-activity.ts` allow-lists actor/action/target/detail and inserts through a caller-supplied owner-authenticated adapter. `src/runtime.ts` verifies the owner session, reads the owner-scoped power registry and kill switch, and uses anon key + owner bearer for PostgREST. `src/handler.ts` exposes `handle(action, request, context)` for LEAD's existing shared API function. Migration proposal `0072_s05_activity_log_timeline.sql` adds safe timeline indexes and explicit grants/RLS hardening.
INPUTS / OUTPUTS: `logActivity({ actor, action, target, detail, why, ok, decision_id? }, { insert })` returns `{ ok, id? }` or `{ ok:false, code }`. `handle('activity-logs.list', request, context)` returns a no-store `{ ok, data }` envelope; free-form content never appears in `detail`.
USES / USED BY: Uses `api.auth`, `packages.brain`, `packages.memory`, and `features.core-workspace.task-manager` (shared S08 sensitivity). History consumes this unit. All squads may call `logActivity()` after their own power-gated action.
POWER LEVEL & CONFIRMATION: Read route requires the registered `activity-logs.read` S22 power and an explicit healthy kill-switch read. L0/L1 observation is allowed only for this read-only, redacted projection. `logActivity()` is an internal audit sink, not a user-invokable action; its caller must already have passed its own registered power gate. Unknown power or unreadable/ON kill switch fails closed.
EXAMPLES: `await logActivity({ actor: 'owner', action: 'history.messages.list', target: 'chat_thread', why: 'Owner opened a redacted chat history thread.', ok: true }, { insert })`.
KNOWN ISSUES: S22 power row, LEAD action mounting, `0072` DB migration and S00 shell integration are pending acceptance. S08/S09 classifiers are conservative and may mask more than one expects; no raw private text is shown as a fallback.
CHANGE LOG:
- (append-only) 2026-11-23: S05 built initial logger, safe projection, owner handler and Activity Logs panel on P31 baseline. Owner: S05.


Power behaviour: L0/L1 are observation-only. If the registered read power reaches L2, the handler returns `confirmation_required` until the owner submits `confirmed: true`; the UI exposes an explicit confirm action. A missing power or unreadable/ON kill switch always fails closed.
