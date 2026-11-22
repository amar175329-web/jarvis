# today
STATUS: built
WHAT IT IS: S08 Today page: an owner-scoped daily view over tasks and reminders. It is a data consumer for D2 Today’s Focus and Today’s Schedule, not a replacement for those Home cards.
WHAT IT CAN DO:
- Show today's task timeline, open task counts, overdue counts, and priority-ranked tasks.
- Expose the stable owner-scoped `focus` and `schedule` projection from `POST /api/tasks/tasks.today` for S01/S02.
- Keep medicine details out of generic schedule labels; reminders are projected with a generic title only.
- Link into S08 task-manager and reminders pages once the shell route is accepted.
WHAT IT CANNOT DO / LIMITS:
- Cannot edit the app shell, approved reference HTML, or D2 Home cards; S00/S01/S02 own those surfaces.
- Does not infer or disclose T2 medicine details in generic summaries, events, or logs.
- It is not wired into app navigation until LEAD accepts the integration CR.
HOW IT WORKS:
- `ui/TodayPage.tsx` reads the daily owner-scoped projection through the existing owner session.
- The API groups tasks/reminders in Asia/Kolkata and exposes the D2-compatible projection separately from this page's UI.
- Components and styles stay within this feature folder; S00 integrates them into the existing shell.
INPUTS / OUTPUTS: Input: owner session, task/reminder rows, and owner timezone. Output: daily open/overdue/task list and D2-compatible `focus` / sorted `schedule` projection.
USES / USED BY: Uses `features.core-workspace.task-manager`, `features.core-workspace.reminders`, and `api.tasks`. Used by S01 Today’s Focus, S02 Today’s Schedule, and app shell after integration.
POWER LEVEL & CONFIRMATION: L0 read-only display; mutations delegate to the registered S08 powers in task-manager/reminders. Unknown power or unreadable kill switch denies actions.
EXAMPLES: Aaj ke open/overdue tasks aur aaj ke scheduled reminders ko IST timeline mein dikhana; D2 may reuse `focus.top_tasks` and `schedule` from the same API response.
KNOWN ISSUES: Not integrated into shell; needs S00 CR acceptance, the 0060 migration and the S08 API route contract.
CHANGE LOG:
- 2026-11-21 - Folder-First plan created by S08 before code; version 0.0.1.
- 2026-11-21 - Added Today page and D2-compatible read projection contract in the S08 API; version 0.1.0.
