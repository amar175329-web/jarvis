import { classifySensitivity } from '../../../core-workspace/task-manager/src/sensitivity.mjs';

export const ACTIONS = Object.freeze(['activity.recent']);
export const RECENT_ACTIVITY_POWER = 'home.recent-activity.read';
const MAX_ITEMS = 8;
const OPAQUE_TARGET = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9]{1,20}|req_[0-9a-f]{8,32})$/i;
const SAFE_ACTORS = new Set(['api', 'worker', 'system', 'jarvis', 'web', 'android', 'auth', 'tasks', 'reminders', 's00', 's05', 's08']);
const SAFE_ACTIONS = new Map([
  ['tasks.create', { label: 'Task created', kind: 'task' }],
  ['task.created', { label: 'Task created', kind: 'task' }],
  ['tasks.update', { label: 'Task updated', kind: 'task' }],
  ['task.updated', { label: 'Task updated', kind: 'task' }],
  ['tasks.complete', { label: 'Task completed', kind: 'complete' }],
  ['task.completed', { label: 'Task completed', kind: 'complete' }],
  ['tasks.cancel', { label: 'Task cancelled', kind: 'task' }],
  ['reminders.create', { label: 'Reminder created', kind: 'reminder' }],
  ['reminders.cancel', { label: 'Reminder cancelled', kind: 'reminder' }],
  ['log.warn', { label: 'System warning', kind: 'system' }],
  ['log.error', { label: 'System alert', kind: 'system' }],
  ['auth.login', { label: 'Owner session started', kind: 'system' }],
  ['session.created', { label: 'Owner session started', kind: 'system' }],
]);

function hasDetailContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function rowText(row) {
  let detail = '';
  try {
    detail = JSON.stringify(row.detail ?? null);
  } catch {
    return null;
  }
  if (detail === undefined || detail.length > 5_000) return null;
  const target = typeof row.target === 'string' ? row.target.trim() : '';
  const classifierTarget = target && !OPAQUE_TARGET.test(target) ? target : '';
  return [row.actor, row.action, classifierTarget, detail].filter((part) => part !== null && part !== undefined).join(' ');
}

/**
 * Reduce an activity row to a strict display DTO. Raw detail/target/actor/action
 * values are never returned. Unknown/free-form shapes are private by default.
 */
export function sanitizeActivityEntry(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = row && (typeof row.id === 'string' || typeof row.id === 'number') ? String(row.id) : '';
  const ts = typeof row?.ts === 'string' && Number.isFinite(Date.parse(row.ts)) ? new Date(row.ts).toISOString() : '';
  if (!id || !ts) return null;

  const actor = typeof row.actor === 'string' ? row.actor.trim().toLowerCase() : '';
  const action = typeof row.action === 'string' ? row.action.trim().toLowerCase() : '';
  const target = typeof row.target === 'string' ? row.target.trim() : '';
  const actionInfo = SAFE_ACTIONS.get(action);
  const text = rowText(row);
  const classifierPrivate = text === null || classifySensitivity(text).sensitive;
  const detailPrivate = hasDetailContent(row.detail);
  const targetPrivate = Boolean(target && !OPAQUE_TARGET.test(target));
  const actorPrivate = !SAFE_ACTORS.has(actor);
  const actionPrivate = !actionInfo;
  const isPrivate = classifierPrivate || detailPrivate || targetPrivate || actorPrivate || actionPrivate;

  return {
    id,
    ts: isPrivate ? '' : ts,
    label: isPrivate ? 'Private activity' : actionInfo.label,
    kind: isPrivate ? 'private' : actionInfo.kind,
    ok: !isPrivate && row.ok === true,
    private: isPrivate,
  };
}

function json(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}
function fail(status, code, message) {
  return json(status, { ok: false, error: { code, message } });
}

/**
 * Plain feature handler. The shared API function supplies the already verified
 * owner, RLS-backed read adapter and `executePower` wrapper; this module never
 * authenticates users or accesses service-role credentials itself.
 */
export async function handle(action, request, context = {}) {
  if (!ACTIONS.includes(action)) return null;
  if (request?.method !== 'POST') return fail(400, 'bad_request', 'POST required hai.');

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000) return fail(413, 'payload_too_large', 'Request body bahut bada hai.');
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'bad_request', 'Valid JSON body required hai.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    return fail(400, 'bad_request', 'Empty JSON body required hai.');
  }
  if (typeof context.ownerId !== 'string' || !context.ownerId || typeof context.readActivity !== 'function' || typeof context.runPower !== 'function') {
    return fail(503, 'unavailable', 'Recent activity read abhi configured nahi hai.');
  }

  try {
    const outcome = await context.runPower({
      powerId: RECENT_ACTIVITY_POWER,
      why: 'Read privacy-filtered owner activity for the Home Recent Activity card.',
      confirmed: false,
      run: async () => {
        const rows = await context.readActivity({ ownerId: context.ownerId, limit: MAX_ITEMS });
        if (!Array.isArray(rows)) throw new Error('activity adapter returned invalid data');
        return rows.slice(0, MAX_ITEMS).flatMap((row) => {
          const item = sanitizeActivityEntry(row);
          return item ? [item] : [];
        });
      },
    });
    if (!outcome?.ok) {
      const status = Number.isInteger(outcome?.status) ? outcome.status : 503;
      const code = typeof outcome?.code === 'string' ? outcome.code : 'unavailable';
      const message = typeof outcome?.message === 'string' ? outcome.message : 'Recent activity read block hai.';
      return fail(status, code, message);
    }
    return json(200, { ok: true, data: { items: outcome.result } });
  } catch {
    return fail(503, 'unavailable', 'Recent activity abhi unavailable hai.');
  }
}
