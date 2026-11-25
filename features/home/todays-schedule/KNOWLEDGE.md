# todays-schedule
STATUS: built
WHAT IT IS: Home ka Today's Schedule card jo S08 ke existing `tasks.today` projection se aaj ka task/reminder timeline read karta hai.
WHAT IT CAN DO:
- Existing `schedule` projection ke aaj ke task aur generic reminder slots dikhata hai (first 3, same as approved static card density).
- Owner timezone use karke time labels format karta hai.
- Loading, error aur empty states dikhata hai.
WHAT IT CANNOT DO / LIMITS:
- Koi calendar/event table, Google Calendar sync, task table, route, migration ya write action nahi banata.
- Generic reminder title ko private reminder text se replace nahi karta.
- `HomePage.tsx`, `Sidebar.tsx`, `App.tsx` ya shared CSS ko edit nahi karta; S00/Antigravity component mount karega.
HOW IT WORKS: `taskApi.today()` se owner-authenticated S08 `tasks.today` projection padhta hai; card read-only hai aur kisi model ko call nahi karta.
INPUTS / OUTPUTS: Input: `TodayProjection.schedule`, `date`, `time_zone`. Output: approved Home card ke same 3-row timeline.
USES / USED BY: Uses `features.core-workspace.today` and `features.core-workspace.task-manager`; mounted by `app/src/components/HomePage.tsx` through S00/Antigravity.
POWER LEVEL & CONFIRMATION: L0 observe only; koi action ya confirmation nahi. Existing S08 `tasks.today` route ko `tasks.today.read` power se gate karna hai (CR pending); seed current L0/default L3/max L3, owner ko L3 tak raise karna hoga.
EXAMPLES: IST mein `6:20 AM — Morning walk`; empty day par `Aaj ka schedule abhi empty hai.`
KNOWN ISSUES: Current S08 projection provides tasks and generic reminders only; it is not Google Calendar sync. `tasks.today.read` power-gate CR is pending; initial L0 blocks until owner raises read access to L3.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S02.
- 2026-11-22 - P28 bundle (1) plan fixed to the existing S08 projection; no calendar writes - 0.0.2.
- 2026-11-22 - Added `TodaysScheduleCard` with timezone-aware 3-row projection rendering - 0.1.0.
