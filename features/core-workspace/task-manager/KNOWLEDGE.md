# task-manager
STATUS: built
WHAT IT IS: S08 owner-scoped task management with deterministic Hindi/Hinglish quick-add and an editable Task Manager page.
WHAT IT CAN DO:
- Create, list, edit, complete, and cancel tasks through the shared S08 API function.
- Parse common Hindi/Hinglish/Devanagari dates, weekday names, times, repeat rules, and priority cues without an LLM call.
- Use one shared `src/sensitivity.mjs` classifier from both the parser and API; health, medicine, credential, bank/account, and uncertain private-context text is blocked before public-table writes.
- Store due timestamps with an explicit IANA time zone; default is Asia/Kolkata.
- Create the next recurring task only after a task is completed; late completions skip missed repeat periods.
- Link a task to a project using the existing `memory_links` relation (`src_type=task`, `rel=part_of`, `dst_type=project`).
WHAT IT CANNOT DO / LIMITS:
- Does not persist health/medicine/credential/financial or uncertain private-context text as normal task/reminder content; the API asks `yeh private hai? abhi sirf normal reminders save hote hain` and blocks the write until an approved private path exists.
- Does not call a model; parsing is deterministic and deliberately asks for AM/PM when a time is ambiguous.
- Mutations remain blocked until LEAD accepts the API contract, S22 registers/raises the required powers, and Antigravity applies the 0060 migration.
- App shell/navigation integration is owned by S00; this feature does not edit `app/src` or the approved UI reference.
HOW IT WORKS:
- `src/natural-language.mjs` resolves the user's phrase into a task/reminder proposal using the owner time zone and calls the shared privacy classifier before any public persistence decision.
- `ui/TaskManagerPage.tsx` calls the typed client in `src/api-client.ts`; the single `api/tasks/index.ts` validates the payload, verifies `readOwnerSession`, and accesses Supabase with anon key + the owner's bearer token so RLS stays active.
- Every write calls `executePower`; the API pre-writes a metadata-only decision intent, checks the kill switch fail-closed, and requires the registered power's confirmation policy.
INPUTS / OUTPUTS: Input: free-form Hindi/Hinglish or structured task fields. Output: owner task records with title, notes, due_at, priority, status, repeat_rule and time_zone; private medicine text is not returned/stored.
USES / USED BY: Uses `api.tasks`. Used by Today, Reminders, and D2 Today Focus/Schedule read projections.
POWER LEVEL & CONFIRMATION: The feature has no direct autonomy. `tasks.create`, `tasks.update`, `tasks.complete`, `tasks.cancel`, and `tasks.link-project` are S22-owned registry rows; start at L0, require owner confirmation at L2, max L2 for personal data, and fail closed when missing or blocked.
EXAMPLES: `kal subah 7 baje project review` resolves to a tomorrow 07:00 IST task; `kal 7 baje meeting` pauses for AM/PM confirmation.
KNOWN ISSUES: Database fields `repeat_rule` and `time_zone` require the proposed 0060 migration. Route schemas and route aliases await S00 approval. Existing UI shell navigation is not wired in this patch.
CHANGE LOG:
- 2026-11-21 - Folder-First plan created by S08 before code; version 0.0.1.
- 2026-11-21 - Added deterministic parser, task API client, responsive Task Manager UI, repeat scheduling logic, tests and S08 API unit; version 0.1.0.
- 2026-11-21 - P28/P29: expanded health sensitivity classifier terms (`physio`, `physiotherapy`, `dentist`, `periods`, `saans`, `pump`, `inhaler` in Roman + Devanagari) and added explicit L2 Hinglish confirmation step (`"Main ye task banaun? <title>, <time>"` with `[Haan]` / `[Nahi]`) plus clear `needs_confirmation` question handling in `TaskManagerPage.tsx`; version 0.2.0.
- 2026-11-22 - P31: fixed `resolveHour` daypart rules (`raat` 8..11 => PM, 12 => `midnight_date`, 1..4 => `night_after_midnight`; `shaam` 4..9 => PM; `dopahar` 12 + 1..5 => PM; `subah` 5..11 => AM), clear Hinglish `invalid_time` message, Devanagari & trailing daypart support, and `"Main ye reminder banaun?"` prompt for reminders; version 0.2.1.

- Bundle 3 (2026-11-23): UI now performs item-local optimistic edit/delete and five-second undo for done/cancel; pagehide flushes queued transitions with fetch keepalive; focus/visible/30s refresh syncs other clients without a post-mutation full-list refetch. Tasks and reminders split active/archive, and Task tab count covers only todo/doing.
- Bundle 3 parser: time ranges produce nullable `ends_at`; ambiguous range start follows existing AM/PM clarification. Reminder-intent text (`yaad dilao`, `yaad karana`, `remind`) resolves to reminder kind and is cleaned from the subject.
- Bundle 3 server acceptance is pending: client expects `tasks.delete`, `reminders.update`, `reminders.complete`, and `reminders.delete`; task clash enforcement, duplicate reminder 409, owner-scoped route changes and mutation schemas are in `docs/s08-bundle3/CHANGE_REQUEST_API.md`. Do not treat the client endpoints as live until LEAD mounts them in the existing `api/tasks/index.ts` function.
- Bundle 3 `ends_at`, reminder `done` state, owner/status/due index and transactional reminder/job RPCs are only proposed in `docs/s08-bundle3/0061_s08_proposal.sql`; do not apply until approval.
- Bundle 3 retains the shared sensitivity classifier for task/reminder edits; the UI check is defense-in-depth only. Server-side reminder edit guard remains an API CR acceptance requirement.
- 2026-11-23 - Bundle 3: optimistic row-level actions, five-second undo/pagehide queue, archive/count handling, reminder edit form, due-time range parser, reminder-intent routing, privacy expansion, tests and API/power/migration proposals; version 0.3.0.
- 2026-11-22 - P31: fixed `resolveHour` daypart rules (`raat` 8..11 => PM, 12 => `midnight_date`, 1..4 => `night_after_midnight`; `shaam` 4..9 => PM; `dopahar` 12 + 1..5 => PM; `subah` 5..11 => AM), clear Hinglish `invalid_time` message, Devanagari & trailing daypart support, and `"Main ye reminder banaun?"` prompt for reminders; version 0.2.2.

- 2026-11-23 - Expanded the shared S08 sensitivity classifier for Hinglish self-harm/emotional distress, bank-balance questions, and medicine misspellings (dwai/daava/davai/dava); generic “report” is no longer a health hit, while medical/lab/test report phrases remain private; version 0.2.2.

- 2026-11-23 - LEAD Hinglish privacy-gap fix shared by S08/S09/S05: self-harm and emotional distress patterns, bank-balance/paisa phrases, medicine spelling variants (dwai/daava/davai/dava/goli), and specific medical-report phrases; generic “report bhejni hai” and neutral “gym jaana” remain ordinary; version 0.2.2.
