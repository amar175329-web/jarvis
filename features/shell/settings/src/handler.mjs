import { parseShellPreferences, SETTINGS_KEY, validateShellPreferencePatch } from './settings-policy.mjs';
export const SETTINGS_ACTIONS = Object.freeze(['settings.read', 'settings.update']);
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
function validContext(c) { return c?.supabase && typeof c.supabase.url === 'string' && typeof c.supabase.anonKey === 'string' && typeof c.requireOwner === 'function'; }
async function readBody(request) { try { const raw = await request.text(); if (raw.length > 4000) return null; return JSON.parse(raw); } catch { return null; } }
function headers(db, token, extra = {}) { return { apikey: db.anonKey, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }; }
function withCookie(response, owner) { if (!owner?.setCookie) return response; const h = new Headers(response.headers); h.set('set-cookie', owner.setCookie); return new Response(response.body, { status: response.status, headers: h }); }
async function readPreferences(db, token) {
  const url = new URL(`${db.url.replace(/\/$/, '')}/rest/v1/settings`); url.search = new URLSearchParams({ select: 'value', key: `eq.${SETTINGS_KEY}`, limit: '1' }).toString();
  const r = await (db.fetch ?? fetch)(url, { headers: headers(db, token) }); if (!r.ok) throw new Error('settings read failed');
  const rows = await r.json(); if (!Array.isArray(rows)) throw new Error('invalid settings response');
  return parseShellPreferences(rows[0]?.value);
}
export async function handle(action, request, context = {}) {
  if (!SETTINGS_ACTIONS.includes(action)) return fail(404, 'not_found', 'unknown settings action');
  if (!validContext(context)) return fail(503, 'unavailable', 'settings handler context is incomplete');
  const expected = action === 'settings.read' ? 'GET' : 'POST'; if (request.method !== expected) return fail(405, 'bad_request', `method not allowed; use ${expected}`);
  const owner = await context.requireOwner(request); if (!owner?.ok || !owner.accessToken || !owner.user?.id) return fail(owner?.status ?? 401, 'unauthorized', owner?.message ?? 'owner session required');
  const db = context.supabase;
  try {
    if (action === 'settings.read') return withCookie(json(200, { ok: true, data: { preferences: await readPreferences(db, owner.accessToken) } }), owner);
    const body = await readBody(request); if (!body || Object.keys(body).some((key) => !['preferences', 'confirm'].includes(key)) || body.confirm !== true) return withCookie(fail(400, 'bad_request', 'preferences and explicit confirm:true are required'), owner);
    const patch = validateShellPreferencePatch(body.preferences); if (!patch.ok) return withCookie(fail(400, 'bad_request', patch.message), owner);
    if (typeof context.executePower !== 'function') return withCookie(fail(503, 'unavailable', 'settings.update power is not connected'), owner);
    const current = await readPreferences(db, owner.accessToken); const merged = { ...current, ...patch.value };
    const result = await context.executePower({
      powerId: 'settings.update', ownerId: owner.user.id, confirmed: true,
      why: 'Amit ne general JARVIS preferences update ki',
      run: async () => {
        const url = `${db.url.replace(/\/$/, '')}/rest/v1/settings?on_conflict=owner_id%2Ckey`;
        const r = await (db.fetch ?? fetch)(url, { method: 'POST', headers: headers(db, owner.accessToken, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: SETTINGS_KEY, value: merged }) });
        if (!r.ok) throw new Error('settings write failed'); return merged;
      },
    });
    if (!result?.executed) return withCookie(fail(403, 'power_blocked', 'settings.update power is not enabled; abhi band'), owner);
    return withCookie(json(200, { ok: true, data: { preferences: merged } }), owner);
  } catch { return withCookie(fail(503, 'unavailable', 'settings are unavailable'), owner); }
}
