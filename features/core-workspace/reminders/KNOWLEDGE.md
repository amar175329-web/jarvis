# reminders
STATUS: built
WHAT IT IS: S08 owner-scoped reminder CRUD, recurrence scheduling, and the worker-side reminder-fire handler.
WHAT IT CAN DO:
- Create, list, and cancel public/non-sensitive reminders from manual form fields or deterministic Hindi/Hinglish quick-add.
- Queue each reminder in the existing `public.jobs` table with `kind=reminders.fire`, only `{reminder_id}` in the payload, a stable per-occurrence idempotency key, and a link to the pre-written owner `decisions` approval row.
- Advance daily, weekly, weekdays, or monthly reminders in the reminder time zone; late worker runs skip missed periods.
- Validate and consume the S09 `MedicineReminderRequest` shape without treating the hand-off as an already-created reminder.
WHAT IT CANNOT DO / LIMITS:
- Does not store T2 medicine labels/display text in plaintext. S19 private vault encryption/decryption is not present, so valid medicine hand-offs are intentionally blocked from persistence.
- Does not itself send device notifications. S00 must register the handler in `worker/jobs`; S16A must provide the allow-listed `notification.show` capability and notification client.
- Mutations remain blocked until LEAD contracts, S22 powers, the 0060 migration and the worker integration are accepted/applied.
HOW IT WORKS:
- `src/memory-handoff.mjs` validates `MedicineReminderRequest`, asks for AM/PM/date when missing, and blocks while the private vault is unavailable.
- `src/time-recurrence.mjs` resolves supported repeat rules in an IANA time zone.
- `src/fire-handler.mjs` fetches a pending due reminder, verifies its `approved_decision_id` against the owner's `reminders.create` decision, dispatches through `reminders.fire` power, sends a notification via an injected S16A adapter with a per-occurrence idempotency key, then marks/requeues it. Only reminder IDs enter logs.
- The API creates both the reminder row and the owner-scoped worker job through RLS; it never uses a service-role key in the app function.
INPUTS / OUTPUTS: Input: reminder text, remind_at, repeat_rule, time_zone, optional task_id; or S09 `MedicineReminderRequest`. Output: pending/fired/cancelled reminders and queued fire jobs. Medicine output is blocked until S19 integration.
USES / USED BY: Uses `api.tasks`, `packages.memory`, `worker.jobs`, `packages.harness`, and `packages.safety`. S09 produces the medicine hand-off; S00 wires the worker; S16A provides notifications; Today and D2 read the generic schedule projection.
POWER LEVEL & CONFIRMATION: `reminders.create`, `reminders.cancel`, and `reminders.fire` must be S22-registered powers owned by S08, starting at L0 and capped at L2 for personal/health data. Owner confirmation is required for L2 creation/cancellation; scheduled firing relies on persisted approval policy and the worker gate only after the original owner-approved decision link verifies. Kill switch unreadable/ON denies.
EXAMPLES: `kal subah 7 baje meeting yaad dilana` can queue a public reminder. A medicine reminder is not persisted from `MedicineReminderRequest` until the S19 private vault and S09 date/time additions are accepted.
KNOWN ISSUES: S09's current hand-off has no date field; `date_text` and `time_zone` are proposed optional additions. `packages/scheduler` is not implemented, so this feature uses existing `worker/jobs` and requires S00 handler registration. S16A notifications are not wired.
CHANGE LOG:
- 2026-11-21 - Folder-First plan created by S08 before code; version 0.0.1.
- 2026-11-21 - Added recurrence, S09 hand-off validator, fail-closed worker handler, reminder UI and API client; version 0.1.0.

- Bundle 3 (2026-11-23): UI supports reminder edit (text/time/repeat), done/cancel with five-second Undo, hard-delete confirmation, and a collapsed Cancelled/Done archive. List refresh occurs on focus, visible-state return and 30-second visible polling; per-action handlers patch one item.
- Reminder update/complete/delete server routes are not yet mounted. See `docs/s08-bundle3/CHANGE_REQUEST_API.md`; route client support must not be mistaken for server readiness.
- Reminder edit must run the same shared sensitivity classifier before any write. Editing also requires transactional cancellation of the old queued `reminders.fire` job and enqueue of the new reminder job, keyed by reminder ID + new time. These DB changes are only proposed in `docs/s08-bundle3/0061_s08_proposal.sql`.
- Reminder firing and Android notification delivery remain out of scope; no worker/device code changed.
- 2026-11-23 - Bundle 3: optimistic reminder edit/done/cancel/delete UX, Undo, archive handling, safe retry messages and CR/0061 proposals; version 0.2.0.
