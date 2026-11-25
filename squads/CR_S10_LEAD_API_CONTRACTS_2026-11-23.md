# CR-S10-LEAD-API-CONTRACTS — Mount Insights + Boards in existing shared function

**Owner:** LEAD
**Raised by:** D1b / S10
**Baseline:** jarvis-repo-P31.zip

## Hard constraints

- Do not add any file under `api/`; do not change `vercel.json`.
- Do not edit `packages/contracts` in this patch; LEAD owns the contract update described below.
- Keep the Vercel Hobby function count unchanged. Both handlers mount inside existing `api/tasks/index.ts`.
- Route before shared `dispatch()` consumes the request body. Do not parse `request.text()` and then pass the consumed Request to the squad handler.

## Exact mount request

In `api/tasks/index.ts`, add imports:

```ts
import { handle as handleInsights } from '../../features/core-workspace/insights/src/handler.ts';
import { handle as handleBoards } from '../../features/core-workspace/boards/src/handler.ts';
```

Inside `dispatch(request, options)`, immediately after deriving `action` from the path/query and before the existing `request.method`, `readOwnerSession`, and `bodyJson(request)` branches, add:

```ts
const squadContext = { env: options.env, fetch: options.fetch };
if (action === 'insights.overview') {
  return handleInsights(action, request, squadContext);
}
if (action.startsWith('boards.')) {
  return handleBoards(action, request, squadContext);
}
```

The squad handlers independently verify the owner session and use the verified user's bearer plus the anon key. Do not pre-read or clone the body. Unknown `boards.*` actions are rejected by the Boards module's allow-list.

## Contract request (LEAD-owned)

Extend the existing `api.tasks` contract/action union with the following POST actions, body schemas and `confirmed?: boolean` field (no new physical route/function):

| Action | Body | Result |
|---|---|---|
| `insights.overview` | `{ period_days?: 7\|30, confirmed?: boolean }` | `{ period_days, tasks:{total,todo,doing,done,cancelled,overdue,completion_rate}, activity:{total,successful,daily:[{date,count}]}, truncated, generated_at }` |
| `boards.list` | `{ confirmed?: boolean }` | `{ boards:[{id,name,created_at,updated_at,columns:[{id,name,position,cards:[safe task projection]}]}] }` |
| `boards.tasks.available` | `{ confirmed?: boolean }` | `{ tasks:[safe task projection] }` |
| `boards.create` | `{ name, confirmed?: boolean }` | `{ board:{id,name} }` |
| `boards.column.create` | `{ board_id, name, confirmed?: boolean }` | `{ column:{id,name,position} }` |
| `boards.column.rename` | `{ column_id, name, confirmed?: boolean }` | `{ renamed:true }` |
| `boards.task.link` | `{ board_id, column_id, task_id, confirmed?: boolean }` | `{ link_id }` |
| `boards.task.move` | `{ link_id, column_id, confirmed?: boolean }` | `{ moved:true }` |
| `boards.task.unlink` | `{ link_id, confirmed?: boolean }` | `{ unlinked:true }` |
| `boards.delete` | `{ board_id, confirmed?: boolean }` | `{ deleted:true }` |

All responses use the existing `{ok,data}` / `{ok:false,error:{code,message}}` envelope. Private task titles/notes are never returned; private cards render only `Private task` and private tasks are excluded from `boards.tasks.available`.

## Important security details

- `handle(action, request, context)` handlers are plain feature modules only.
- Every read checks `insights.read` or `boards.read`, with owner session, owner_id filters, and a fail-closed kill-switch read. At L2 the handler returns `409 confirmation_required` until `confirmed:true`.
- Every mutation writes a decision intent and metadata-only `logActivity()` reason before `executePower()`. L0/L1 is observe/suggest only; L2 needs a second confirmed request.
- No user-provided free text, task title, note, board name, or private content enters decision/activity logs. Board names/column labels are checked by the shared S05 `isPrivateText()` projection before persistence.
- No model call is made. Insights uses only `tasks(status)`, `tasks(id)` and `activity_log(ts,ok)` projections; it does not fetch raw text or detail JSON.
- Do not add service-role access; keep anon key + owner bearer so RLS remains active.
