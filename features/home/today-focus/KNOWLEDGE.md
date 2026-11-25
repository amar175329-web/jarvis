# today-focus
STATUS: built
WHAT IT IS: Home ka Today's Focus card jo S08 ke existing `tasks.today` projection se daily task status read karta hai.
WHAT IT CAN DO:
- Real `open_count` aur `overdue_count` dikhata hai.
- S08 se `completed_today` aur configured `daily_goal` milne par progress ring percentage derive karta hai; missing values ko guess nahi karta.
- Optional S08 `streak_days` value display kar sakta hai.
- Loading, unavailable aur no-task states dikhata hai.
WHAT IT CANNOT DO / LIMITS:
- Naya task table, task endpoint, migration, ya task mutation nahi banata.
- Daily goal ya streak invent nahi karta; P28 ke current projection mein ye fields nahi hain, isliye ring `—` dikhata hai jab tak CR accept na ho.
- `HomePage.tsx`, `Sidebar.tsx`, `App.tsx` ya shared CSS ko edit nahi karta; S00/Antigravity component mount karega.
HOW IT WORKS: `taskApi.today()` se owner-authenticated S08 `tasks.today` projection padhta hai; `src/progress.mjs` sirf real `completed_today / daily_goal` se bounded percentage derive karta hai. Koi model call nahi hota.
INPUTS / OUTPUTS: Input: S08 `TodayProjection` (`focus.open_count`, `focus.overdue_count`, optional `completed_today`, `daily_goal`, `streak_days`). Output: approved Home card style mein read-only focus summary.
USES / USED BY: Uses `features.core-workspace.today` and `features.core-workspace.task-manager`; mounted by `app/src/components/HomePage.tsx` through S00/Antigravity.
POWER LEVEL & CONFIRMATION: L0 observe only; koi action ya confirmation nahi. Existing S08 `tasks.today` route ko `tasks.today.read` power se gate karna hai (CR pending); seed current L0/default L3/max L3, owner ko L3 tak raise karna hoga.
EXAMPLES: `3 Tasks`; projection metrics available hon to `50%` goal ring; metrics absent hon to `—`.
KNOWN ISSUES: Current P28 `tasks.today` route is not power-gated and does not expose completed-today, daily-goal or streak metrics. S08/LEAD CRs pending.
CHANGE LOG:
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S01.
- 2026-11-22 - P28 bundle (1) plan fixed to the existing S08 projection; no task data writes - 0.0.2.
- 2026-11-22 - Added `TodayFocusCard` and tested honest progress derivation; version 0.1.0.
