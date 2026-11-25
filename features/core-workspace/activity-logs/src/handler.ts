import {
  runtimeConfig, resolveOwner, readBody, dbRows, requireReadPower,
  insertActivityRow, fail, success, withCookie, type RuntimeOptions, type Owner,
} from './runtime.ts';
import { logActivity } from './log-activity.ts';
import { isPrivateText, PRIVATE_ACTIVITY_LABEL, sanitizeActivityDetail, safeActivityTarget } from './privacy.ts';

export const actions = ['activity-logs.list'] as const;
const ACTION = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const ACTOR = /^(owner|jarvis|worker|system|s[0-9]{2}[a-z]?)$/i;
const MAX = 100;
type HandlerContext = RuntimeOptions & {
  insertActivity?: (row: Record<string, unknown>) => Promise<{ id?: string | number } | void>;
};
function safeRow(row: Record<string, any>) {
  const targetPrivate = typeof row.target === 'string' && isPrivateText(row.target);
  const actorPrivate = typeof row.actor === 'string' && isPrivateText(row.actor);
  const actionPrivate = typeof row.action === 'string' && isPrivateText(row.action);
  return {
    id: String(row.id),
    ts: row.ts,
    actor: actorPrivate ? 'private' : (ACTOR.test(String(row.actor ?? '')) ? String(row.actor).toLowerCase() : 'system'),
    action: actionPrivate ? 'activity.redacted' : (ACTION.test(String(row.action ?? '')) ? String(row.action) : 'activity.unknown'),
    target: targetPrivate ? PRIVATE_ACTIVITY_LABEL : safeActivityTarget(row.target),
    detail: sanitizeActivityDetail(row.detail),
    ok: row.ok === true,
    decision_id: row.decision_id ?? null,
  };
}

export async function handle(action: string, request: Request, context: HandlerContext = {}): Promise<Response> {
  if (!(actions as readonly string[]).includes(action)) return fail(404, 'not_found', 'Unknown activity-log action.');
  if (request.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
  const config = runtimeConfig(context);
  if (!config) return fail(503, 'unavailable', 'Activity Logs API is not configured.');
  const auth = await resolveOwner(request, context, config);
  if (!auth.ok) return withCookie(auth.response, auth.clearCookie);
  const owner: Owner = auth.owner;
  const body = await readBody(request);
  if (!body) return withCookie(fail(400, 'bad_request', 'Invalid request body.'), owner.setCookie);

  const readGate = await requireReadPower(config, owner, 'activity-logs.read', body.confirmed === true);
  if (!readGate.ok) return withCookie(fail(readGate.status, readGate.code, readGate.message), owner.setCookie);

  const limit = body.limit === undefined ? 50 : body.limit;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > MAX) {
    return withCookie(fail(400, 'bad_request', 'limit must be 1..100.'), owner.setCookie);
  }
  if (body.action !== undefined && (typeof body.action !== 'string' || !ACTION.test(body.action))) {
    return withCookie(fail(400, 'bad_request', 'action filter is invalid.'), owner.setCookie);
  }
  if (body.actor !== undefined && (typeof body.actor !== 'string' || !ACTOR.test(body.actor))) {
    return withCookie(fail(400, 'bad_request', 'actor filter is invalid.'), owner.setCookie);
  }
  if (body.ok !== undefined && typeof body.ok !== 'boolean') {
    return withCookie(fail(400, 'bad_request', 'ok filter must be boolean.'), owner.setCookie);
  }

  try {
    const audit = await logActivity({
      actor: 'owner',
      action: 'activity-logs.list',
      target: 'activity_log',
      why: 'Owner opened the Activity Logs timeline.',
      detail: { limit, why: 'Owner opened the Activity Logs timeline.' },
      ok: true,
    }, {
      insert: (row) => context.insertActivity ? context.insertActivity(row) : insertActivityRow(config, owner, row),
    });
    if (!audit.ok) return withCookie(fail(503, 'unavailable', 'Activity log access could not be recorded; request blocked.'), owner.setCookie);

    const query: Record<string, string> = {
      select: 'id,ts,actor,action,target,detail,decision_id,ok',
      owner_id: `eq.${owner.user.id}`,
      order: 'ts.desc',
      limit: String(Number(limit) + 1),
    };
    if (typeof body.before === 'string') {
      if (!Number.isFinite(Date.parse(body.before))) return withCookie(fail(400, 'bad_request', 'before must be an ISO timestamp.'), owner.setCookie);
      query.ts = `lt.${body.before}`;
    }
    if (typeof body.action === 'string') query.action = `eq.${body.action}`;
    if (typeof body.actor === 'string') query.actor = `eq.${body.actor}`;
    if (typeof body.ok === 'boolean') query.ok = `eq.${body.ok}`;
    const rows = await dbRows(config, owner, 'activity_log', query);
    const page = rows.slice(0, Number(limit));
    const next_before = rows.length > Number(limit) ? page[page.length - 1]?.ts : undefined;
    return withCookie(success({
      items: page.map(safeRow),
      ...(next_before ? { next_before } : {}),
    }), owner.setCookie);
  } catch {
    return withCookie(fail(503, 'unavailable', 'Activity Logs are temporarily unavailable.'), owner.setCookie);
  }
}
