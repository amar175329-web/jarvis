import {
  runtimeConfig, resolveOwner, readBody, dbRows, requireReadPower,
  fail, success, withCookie, insertActivityRow, type RuntimeOptions, type Owner,
} from '../../activity-logs/src/runtime.ts';
import { logActivity } from '../../activity-logs/src/log-activity.ts';

export const actions = ['insights.overview'] as const;
type HandlerContext = RuntimeOptions & {
  insertActivity?: (row: Record<string, unknown>) => Promise<{ id?: string | number } | void>;
  now?: () => Date;
};
const MAX_ROWS = 500;
function periodDays(value: unknown): 7 | 30 | null {
  if (value === undefined) return 7;
  return value === 7 || value === 30 ? value : null;
}
function dayKey(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}
function utcDay(date: Date): string { return date.toISOString().slice(0, 10); }
function buildDaily(days: 7 | 30, from: Date, rows: Record<string, any>[]) {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = typeof row.ts === 'string' ? dayKey(row.ts) : null;
    if (key) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(from.getTime() + index * 86400000);
    const key = utcDay(date);
    return { date: key, count: buckets.get(key) ?? 0 };
  });
}
async function recordRead(
  action: string,
  owner: Owner,
  config: NonNullable<ReturnType<typeof runtimeConfig>>,
  context: HandlerContext,
  days: number,
) {
  return logActivity({
    actor: 'owner', action, target: 'task',
    why: 'Owner viewed aggregate insights from safe task and activity metadata.',
    detail: { result: 'viewed', period_days: days }, ok: true,
  }, { insert: (row) => context.insertActivity ? context.insertActivity(row) : insertActivityRow(config, owner, row) });
}

/** Plain action module. LEAD mounts this in the existing shared /api/tasks function. */
export async function handle(action: string, request: Request, context: HandlerContext = {}): Promise<Response> {
  if (!(actions as readonly string[]).includes(action)) return fail(404, 'not_found', 'Unknown insights action.');
  if (request.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
  const config = runtimeConfig(context);
  if (!config) return fail(503, 'unavailable', 'Insights API is not configured.');
  const auth = await resolveOwner(request, context, config);
  if (!auth.ok) return withCookie(auth.response, auth.clearCookie);
  const owner = auth.owner;
  const body = await readBody(request);
  if (!body) return withCookie(fail(400, 'bad_request', 'Invalid request body.'), owner.setCookie);
  const days = periodDays(body.period_days);
  if (!days || (body.confirmed !== undefined && typeof body.confirmed !== 'boolean')) {
    return withCookie(fail(400, 'bad_request', 'period_days must be 7 or 30.'), owner.setCookie);
  }
  const gate = await requireReadPower(config, owner, 'insights.read', body.confirmed === true);
  if (!gate.ok) return withCookie(fail(gate.status, gate.code, gate.message), owner.setCookie);

  const now = context.now?.() ?? new Date();
  const from = new Date(now.getTime() - (days - 1) * 86400000);
  const fromIso = new Date(`${utcDay(from)}T00:00:00.000Z`).toISOString();
  try {
    // These are deliberately narrow allowed projections: no titles, notes, content, targets or detail JSON.
    const [taskRows, overdueRows, activityRows] = await Promise.all([
      dbRows(config, owner, 'tasks', {
        select: 'status', owner_id: `eq.${owner.user.id}`,
        created_at: `gte.${fromIso}`, order: 'created_at.asc', limit: String(MAX_ROWS),
      }),
      dbRows(config, owner, 'tasks', {
        select: 'id', owner_id: `eq.${owner.user.id}`, status: 'in.(todo,doing)',
        due_at: `lt.${now.toISOString()}`, limit: String(MAX_ROWS),
      }),
      dbRows(config, owner, 'activity_log', {
        select: 'ts,ok', owner_id: `eq.${owner.user.id}`,
        ts: `gte.${fromIso}`, order: 'ts.asc', limit: String(MAX_ROWS),
      }),
    ]);
    const counts = { todo: 0, doing: 0, done: 0, cancelled: 0 };
    for (const row of taskRows) {
      if (row.status === 'todo' || row.status === 'doing' || row.status === 'done' || row.status === 'cancelled') counts[row.status]++;
    }
    const total = taskRows.length;
    const completionRate = total ? Math.round((counts.done / total) * 100) : 0;
    const dailyActivity = buildDaily(days, new Date(fromIso), activityRows);
    const audit = await recordRead(action, owner, config, context, days);
    if (!audit.ok) return withCookie(fail(503, 'unavailable', 'Insights access could not be recorded; request blocked.'), owner.setCookie);
    return withCookie(success({
      period_days: days,
      tasks: { total, ...counts, overdue: overdueRows.length, completion_rate: completionRate },
      activity: {
        total: activityRows.length,
        successful: activityRows.filter((row) => row.ok === true).length,
        daily: dailyActivity,
      },
      truncated: taskRows.length >= MAX_ROWS || activityRows.length >= MAX_ROWS || overdueRows.length >= MAX_ROWS,
      generated_at: now.toISOString(),
    }), owner.setCookie);
  } catch {
    return withCookie(fail(503, 'unavailable', 'Insights projection is temporarily unavailable.'), owner.setCookie);
  }
}
