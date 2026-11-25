# recent-activity
STATUS: built
WHAT IT IS: Home ka Recent Activity card, jo owner ke activity log ka privacy-filtered preview dikhata hai.
WHAT IT CAN DO:
- Existing `activity_log` table se latest max 8 owner-scoped entries read karne ke liye plain `handle(action, request, context)` module deta hai.
- Shared `classifySensitivity()` use karke sensitive entries ko `Private activity` label mein reduce karta hai.
- Server par redaction karta hai; `target`, arbitrary `detail`, actor/action raw values kabhi browser response mein nahi bhejta.
- Detail-bearing, unknown actor/action, malformed ya uncertain entry shapes ko fail-closed `Private activity` label deta hai.
- Read ko proposed registered L0 `home.recent-activity.read` power aur injected fail-closed executePower wrapper ke andar chalata hai.
WHAT IT CANNOT DO / LIMITS:
- Koi naya activity table, API function file, migration, event, or log writer nahi banata.
- Koi private text display, summarise, send to a cloud/local model, ya activity content mutate nahi karta.
- `api/tasks/index.ts`, `packages/contracts`, `HomePage.tsx`, `Sidebar.tsx`, `App.tsx` ya `vercel.json` edit nahi karta.
- Existing shared classifier ka family phrase coverage limited hai; free-form values isliye hamesha hidden hain.
HOW IT WORKS: LEAD existing `/api/tasks` function mein action mount karega. Function verified owner context, owner-scoped RLS read adapter aur shared `runMutation`/`executePower` wrapper inject karta hai. Handler shared classifier + strict safe actor/action allowlist se response sanitize karta hai.
INPUTS / OUTPUTS: Input: owner id aur activity rows (`id,ts,actor,action,target,detail,ok`). Output: `{items:[{id,ts,label,kind,ok,private}]}`; raw `target/detail` omitted. Route `/api/tasks/activity.recent` proposed (CR pending).
USES / USED BY: Uses `features.core-workspace.task-manager` shared sensitivity classifier and `api.tasks` shared function mount.
POWER LEVEL & CONFIRMATION: Proposed `home.recent-activity.read` read-only power: `autonomy_default=3`, `autonomy_current=0`, `max_level=3`, `needs_confirm=false`, `tags=[]`. It stays blocked at L0 until owner raises it to L3; each read then passes `executePower` and is decision-logged. Kill switch ON/unreadable or missing power denies the read. S22 registration is pending.
EXAMPLES: Health/medicine/money/family/password detail -> `Private activity`; allowlisted task action with empty detail and opaque target -> `Task completed`.
KNOWN ISSUES: API mount, route contract and S22 power registration are pending LEAD approval. Strict hiding may label otherwise benign detail-bearing entries as private by design.
CHANGE LOG:
- 2026-11-23 - Opaque UUID/numeric/request targets are excluded from classifier input; added UUID-safe and medicine-target regression tests - 0.1.1.
- (append-only) folder-first: created as planned, version 0.0.1. Owner: S05.
- 2026-11-22 - P28 bundle (1) plan: owner-only read, server-side privacy reduction, no private text in response - 0.0.2.
- 2026-11-22 - Added sanitized activity handler, UI card and Node tests; no API route or schema edited - 0.1.0.
