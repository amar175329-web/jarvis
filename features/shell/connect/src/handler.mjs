import { projectDevice } from './connect-policy.mjs';
export const CONNECT_ACTIONS = Object.freeze(['devices.list']);
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function fail(status, code, message) { return json(status, { ok: false, error: { code, message } }); }
export async function handle(action, request, context = {}) {
  if (!CONNECT_ACTIONS.includes(action)) return fail(404, 'not_found', 'unknown devices action');
  if (request.method !== 'GET') return fail(405, 'bad_request', 'method not allowed; use GET');
  if (!context?.requireOwner || !context?.supabase?.url || !context.supabase.anonKey) return fail(503, 'unavailable', 'devices handler context is incomplete');
  const owner = await context.requireOwner(request); if (!owner?.ok || !owner.accessToken) return fail(owner?.status ?? 401, 'unauthorized', owner?.message ?? 'owner session required');
  try {
    const url = new URL(`${context.supabase.url.replace(/\/$/, '')}/rest/v1/devices`);
    url.search = new URLSearchParams({ select: 'id,name,kind,paired_at,last_seen,revoked_at', revoked_at: 'is.null', order: 'last_seen.desc.nullslast', limit: '20' }).toString();
    const r = await (context.supabase.fetch ?? fetch)(url, { headers: { apikey: context.supabase.anonKey, Authorization: `Bearer ${owner.accessToken}` } });
    if (!r.ok) throw new Error('devices read failed');
    const rows = await r.json(); if (!Array.isArray(rows)) throw new Error('invalid devices response');
    const devices = rows.map((row) => projectDevice(row, context.now?.() ?? Date.now())).filter(Boolean);
    return json(200, { ok: true, data: { devices } });
  } catch { return fail(503, 'unavailable', 'connected devices are unavailable'); }
}
