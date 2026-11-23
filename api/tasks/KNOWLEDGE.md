# tasks API
STATUS: built
WHAT IT IS: One owner-authenticated Vercel function intended to dispatch both `/api/tasks/*` and `/api/reminders/*` actions for S08.
WHAT IT CAN DO:
- Reuse `readOwnerSession` from `api/auth` and the signed-in owner's bearer token with the Supabase anon key so row-level security remains active.
- Read and mutate existing `public.tasks` and `public.reminders`, and enqueue reminder-fire jobs in the existing owner-scoped `public.jobs` table.
- Return the Today projection consumed by S08 and D2.
- Route every write through `packages/harness` `executePower`, fail-closed kill-switch checks, and a pre-written metadata-only decision intent.
WHAT IT CANNOT DO / LIMITS:
- This becomes function 12 of 12 on the supplied Vercel Hobby deployment baseline (11 already used + this one). No squad may add another `api/` function file; all future API routes/features must reuse this function or an already-existing function. Both public route groups need LEAD/S00 rewrites to this handler.
- Does not use a service-role key, edit `packages/contracts`, bypass RLS, or invent/register powers.
- Mutations are expected to stay blocked until S00 accepts the contract and rewrites, S22 registers powers, and Antigravity applies the 0060 migration.
- Medicine/T2 content cannot be persisted without S19 private-vault encryption; accepted S09 hand-offs currently return a safe conflict response.
HOW IT WORKS:
- Resolve the action name from the rewrite query, authenticate owner via `readOwnerSession`, and issue PostgREST requests with only anon-key + owner bearer.
- Validate strict payloads and use `executePower` for mutations. An audit intent is inserted before an action; the log only stores a power ID and one-line why, never task/reminder text.
- Reminder create enqueues `reminders.fire` in `public.jobs`; `worker/jobs` must register the S08 handler after S00 approval.
INPUTS / OUTPUTS: JSON POST to `/api/tasks/<action>` or `/api/reminders/<action>`; JSON `{ok,data}` or `{ok:false,error}`. All operations owner-scoped.
USES / USED BY: Uses `api.auth`, `packages.harness`, `packages.brain`, `packages.safety`, `packages.memory`, `features.core-workspace.task-manager`, and `features.core-workspace.reminders`. Used by Today, Task Manager, Reminders, S01 and S02 projection consumers.
POWER LEVEL & CONFIRMATION: Route shell is not autonomous. Mutations require the S22 power record and the configured level; L0/L1 deny, L2 requires explicit confirmation, max L2 for personal/health data. Missing power, kill switch ON/unreadable or audit-intent failure denies.
EXAMPLES: `POST /api/tasks/tasks.today` returns `{date,time_zone,focus,schedule}`; `POST /api/reminders/reminders.create` stores a permitted non-sensitive reminder and queues the job.
KNOWN ISSUES: Routes and schemas await S00 contract acceptance. Vercel rewrite, 0060 migration, S22 power rows, S00 worker registration, S16A notification adapter and S19 vault adapter are not part of this patch.
CHANGE LOG:
- 2026-11-21 - Folder-First plan created by S08 before code; version 0.0.1.
- 2026-11-21 - Added consolidated owner-auth API implementation for task/reminder/Today actions; version 0.1.0.
- 2026-11-21 - P29: return explicit `409 confirmation_required` when an L2 power (`mode === 'ask_confirm'`) is called with `confirmed: false` or missing instead of generic `503 unavailable`; version 0.2.0.
- 2026-11-22 - P31: forward Hinglish `invalid_time` and `needs_confirmation` messages (`midnight_date`, `night_after_midnight`) from `parseNaturalLanguage`; version 0.2.1.
