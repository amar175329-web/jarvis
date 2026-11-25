import { latestEventTime, NOTIFICATION_EVENT_TYPES, projectNotification, readThroughFromSetting } from './notifications-policy.mjs';

export const NOTIFICATION_ACTIONS = Object.freeze(['notifications.list', 'notifications.mark-read']);
const SETTINGS_KEY = 'notifications.read_through';

function json(status, body, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } }); }
function fail(status, code, message, extra = {}) { return json(status, { ok: false, error: { code, message } }, extra); }
function withCookie(response, owner) {
  if (!owner?.setCookie) return response;
  const headers = new Headers(response.headers); headers.set('set-cookie', owner.setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function validContext(context) {
  const db = context?.supabase;
  return db && typeof db.url === 'string' && typeof db.anonKey === 'string' && typeof (db.fetch ?? fetch) === 'function' && typeof context.requireOwner === 'function';
}
function dbHeaders(db, token, extra = {}) { return { apikey: db.anonKey, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }; }
async function readJson(request) {
  const n = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(n) && n > 2_000) return null;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 2_000) return null; return JSON.parse(raw); } catch { return null; }
}
async function fetchRows(db, token, table, params) {
  const url = new URL(`${db.url.replace(/\/$/, '')}/rest/v1/${table}`); url.search = new URLSearchParams(params).toString();
  const response = await (db.fetch ?? fetch)(url, { headers: dbHeaders(db, token) });
  if (!response.ok) throw new Error(`RLS read failed (${response.status})`);
  const rows = await response.json(); if (!Array.isArray(rows)) throw new Error('invalid database response');
  return rows;
}
async function listEventRows(db, token) {
  return fetchRows(db, token, 'events', { select: 'id,type,ts', type: `in.(${NOTIFICATION_EVENT_TYPES.join(',')})`, order: 'ts.desc', limit: '50' });
}

/** Shared-function module: caller injects owner-session verification and executePower. */
export async function handle(action, request, context = {}) {
  if (!NOTIFICATION_ACTIONS.includes(action)) return fail(404, 'not_found', 'unknown notifications action');
  if (!validContext(context)) return fail(503, 'unavailable', 'notifications handler context is incomplete');
  const expected = action === 'notifications.list' ? 'GET' : 'POST';
  if (request.method !== expected) return fail(405, 'bad_request', `method not allowed; use ${expected}`, { allow: expected });
  const owner = await context.requireOwner(request);
  if (!owner?.ok || !owner.accessToken || !owner.user?.id) return fail(owner?.status ?? 401, owner?.status === 503 ? 'unavailable' : owner?.status === 403 ? 'forbidden' : 'unauthorized', owner?.message ?? 'owner session required', owner?.clearCookie ? { 'set-cookie': 'jarvis_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } : {});
  const db = context.supabase;
  try {
    if (action === 'notifications.list') {
      const [events, settings] = await Promise.all([
        listEventRows(db, owner.accessToken),
        fetchRows(db, owner.accessToken, 'settings', { select: 'value', key: `eq.${SETTINGS_KEY}`, limit: '1' }),
      ]);
      const through = readThroughFromSetting(settings[0]?.value);
      const notifications = events.map((row) => projectNotification(row, through)).filter(Boolean);
      return withCookie(json(200, { ok: true, data: { notifications, unreadCount: notifications.filter((n) => n.unread).length } }), owner);
    }

    const body = await readJson(request);
    if (!body || body.confirm !== true || Object.keys(body).some((key) => key !== 'confirm')) return withCookie(fail(400, 'bad_request', 'explicit confirm:true is required'), owner);
    if (typeof context.executePower !== 'function') return withCookie(fail(503, 'unavailable', 'notifications mark-read power is not connected'), owner);
    const events = await listEventRows(db, owner.accessToken);
    const through = latestEventTime(events) ?? new Date().toISOString();
    const result = await context.executePower({
      powerId: 'notifications.mark-read', ownerId: owner.user.id, confirmed: true,
      why: 'Amit ne visible notifications ko read mark kiya',
      run: async () => {
        const url = `${db.url.replace(/\/$/, '')}/rest/v1/settings?on_conflict=owner_id%2Ckey`;
        const response = await (db.fetch ?? fetch)(url, {
          method: 'POST', headers: dbHeaders(db, owner.accessToken, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ key: SETTINGS_KEY, value: { through } }),
        });
        if (!response.ok) throw new Error(`settings write failed (${response.status})`);
        return { through };
      },
    });
    if (!result?.executed) return withCookie(fail(403, 'power_blocked', 'notifications.mark-read power is not enabled; abhi band'), owner);
    return withCookie(json(200, { ok: true, data: { through } }), owner);
  } catch {
    return withCookie(fail(503, 'unavailable', 'notifications are unavailable'), owner);
  }
}
