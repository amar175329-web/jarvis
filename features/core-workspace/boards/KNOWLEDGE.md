# boards
STATUS: built
WHAT IT IS: S10 owner-scoped Kanban boards linked to existing S08 tasks. Board tables hold board/column metadata and task links only; they do not copy task content.
WHAT IT CAN DO:
- Create and list owner boards with three default columns (To do, In progress, Done).
- Link eligible existing owner tasks to boards, move a link between columns, unlink a task, and delete a board.
- Show safe task titles/status metadata; private task text is represented as a generic `Private task` badge and is never copied into board metadata or audit logs.
- Reject private/secret board names and column labels using S05's shared S08/S09 privacy projection.
- Enforce owner session + bearer + anon-key RLS, S22 power gates, explicit L2 confirmation, fail-closed kill-switch reads, and metadata-only activity logging.
WHAT IT CANNOT DO / LIMITS:
- Does not create duplicate tasks, edit task body/title/status, or copy task text into board tables.
- Does not process attachments, notes, memory, or private content with any model.
- Does not bypass RLS; missing powers, ON/unreadable kill switch, or unavailable audit intent blocks mutations.
- Mutations remain blocked at L0/L1; S22 must explicitly raise a registered power before an action can execute.
HOW IT WORKS: `src/handler.ts` exports `handle(action, request, context)` for LEAD to mount inside the existing shared `/api/tasks` function before request body parsing. It verifies the owner session, checks owner-scoped `powers` and `system_state`, and sends every mutation through `executePower`. It writes a constant action/why intent and S05 `logActivity()` metadata before executing. The handler rechecks task title/notes with S05's shared `isPrivateText` before linking and masks private titles again on list projection. New board/column/link metadata uses `0073_s10_boards.sql`, an un-applied proposal with RLS ENABLE + FORCE and owner-only policies. `ui/BoardsPage.tsx` reuses the approved card tokens and has explicit L2 confirm controls; the UI has a separate confirmation path for read powers too.
INPUTS / OUTPUTS: Input: board/column names, owner UUIDs for existing tasks and links, target column, and `confirmed`. Output: owner boards, columns and safe task-card projections.
USES / USED BY: Uses `api.tasks`, `features.core-workspace.task-manager`, and `features.core-workspace.activity-logs`. Reuses `public.tasks`; no duplicate task table is created.
POWER LEVEL & CONFIRMATION: S22 owns `boards.read`, `boards.create`, `boards.column.create`, `boards.column.rename`, `boards.task.link`, `boards.task.move`, `boards.task.unlink`, and `boards.delete`. All seed at L0, max L2, `needs_confirm=true`, and `personal` tag. Read projections permit L0/L1 observation and ask confirmation at L2. Mutations are observe/suggest only at L0/L1 and require explicit confirmation at L2. Board deletion is irreversible and max L2.
EXAMPLES: Link a safe existing task to the “To do” lane, then explicitly confirm a move to “In progress”. A private task is omitted from available-task choices and, if it already has a link, is shown only as a generic badge without status, priority, due date or link action metadata.
KNOWN ISSUES: LEAD API/contracts mounting, S22 power seed, S00 shell mounting and Antigravity DB migration are pending. No D2 bundle patch was supplied in this turn, so direct patch-collision verification with D2 is NOT RUN. Browser 390px and real DB/RLS tests are NOT RUN.
CHANGE LOG:
- 2026-11-23 - S10 Folder-First implementation with task-link-only boards, privacy projection, power gate, migration proposal, UI and focused tests; version 0.2.0.
