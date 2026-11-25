# insights
STATUS: built
WHAT IT IS: S10 owner-scoped insights page that summarizes only existing safe task and activity metadata projections. News & Briefing has a reserved D2-owned slot.
WHAT IT CAN DO:
- Show aggregate task counts by status, overdue count, completion rate, and activity totals for a bounded 7- or 30-day period.
- Display a seven-day daily trend or five grouped six-day buckets for a 30-day period without selecting task titles, notes, message bodies, memory bodies, file names, activity actions, targets, or detail JSON.
- Render the `CR_D2_NEWS_PLACEMENT` integration slot; D2 owns News & Briefing content and its data source.
- Enforce owner session, owner_id filters, anon-key + owner-bearer PostgREST access, `insights.read`, and a fail-closed kill-switch read.
- Record only a static, metadata-only `insights.overview` audit reason; no model calls are made.
WHAT IT CANNOT DO / LIMITS:
- Cannot summarize private owner text, messages, notes, files, health, medicine, money, family, feelings, or credentials.
- Cannot infer from raw content or call cloud/local models. Any future model feature must use model-gateway + the models router and receive decision-015 approval.
- Cannot trigger actions, alter tasks, export personal data, or bypass S22/kill-switch gates.
- Counts are based only on existing owner-scoped task status and activity timestamp/success projections; they are not a health or financial assessment.
HOW IT WORKS: `src/handler.ts` exports `handle(action, request, context)` for LEAD to mount in the existing shared `/api/tasks` function before that function consumes the request body. It verifies the owner session, requires `insights.read`, then reads only `tasks(status)` constrained by `created_at`, `tasks(id)` for overdue counts, and `activity_log(ts,ok)` with owner_id filters. It returns counts and date buckets only, and records a static metadata-only event through S05 `logActivity()`. `src/api-client.ts` posts through the existing S08 client. `ui/InsightsPage.tsx` uses the approved card/tokens and keeps the D2-owned News & Briefing slot. The 30-day chart groups 30 daily values into five six-day bars to avoid mobile overflow.
INPUTS / OUTPUTS: Input: bounded period (7 or 30 days) and explicit L2 confirmation when required. Output: aggregate counts, completion percentage and dated activity counts only.
USES / USED BY: Uses `api.tasks`, `features.core-workspace.task-manager`, and `features.core-workspace.activity-logs`. Displayed by the S00-mounted Insights tab. D2 News & Briefing content is inserted into the reserved slot by D2.
POWER LEVEL & CONFIRMATION: `insights.read` is S22-owned, seeded at L0 with max L2, personal tag, and confirmation required at L2. Unknown power or ON/unreadable kill switch fails closed. Insights has no mutation power.
EXAMPLES: A seven-day view may show 8 completed tasks and 12 safe activity events; it never exposes task titles or activity detail.
KNOWN ISSUES: LEAD shared-function mounting/contracts, S22 seed, S00 sidebar/page mounting and D2 News & Briefing implementation are pending their owners. Migration is not needed for Insights. DB/RLS integration and browser 390px verification are NOT RUN in this patch environment.
CHANGE LOG:
- 2026-11-23 - S10 Folder-First design, safe aggregate projections, responsive view and handler tests; version 0.2.0.
