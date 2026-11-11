import { createHash } from 'node:crypto';
import { readOwnerSession } from '../auth/index.ts';
import { emitEvent, supabaseEventStore } from '../../packages/events/src/index.ts';
import { readKillSwitch, setKillSwitch, type KillActor, type KillSwitchStore } from '../../packages/safety/src/index.ts';

export type SystemOptions = { env?: Record<string, string | undefined>; fetch?: typeof fetch };
type SystemConfig = { url: string; anonKey: string; serviceKey: string; pepper: string; env: Record<string, string | undefined>; fetcher: typeof fetch };
type Caller = KillActor;

function config(options: SystemOptions): SystemConfig | null {
  const env = options.env ?? process.env;
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = env.DEVICE_TOKEN_PEPPER;
  if (!url || !anonKey || !serviceKey || !pepper || pepper.length < 32) return null;
  return { url, anonKey, serviceKey, pepper, env, fetcher: options.fetch ?? fetch };
}
function json(status: number, body: unknown, headers: HeadersInit = {}) { return Response.json(body, { status, headers }); }
function fail(status: number, code: string, message: string) { return json(status, { ok: false, error: { code, message } }, { 'cache-control': 'no-store' }); }
function method(request: Request, expected: string) { return request.method === expected ? null : fail(405, 'bad_request', `method not allowed; use ${expected}`); }
async function bodyJson(request: Request): Promise<any | null> {
  const n = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(n) && n > 20_000) return null;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 20_000) return null; return JSON.parse(raw); } catch { return null; }
}
function deviceHash(token: string, pepper: string) { return createHash('sha256').update(`${pepper}:${token}`).digest('hex'); }
type CallerResolution =
  | { ok: true; caller: Caller; setCookie?: string }
  | { ok: false; status: number; code: string; message: string };
async function resolveCaller(request: Request, c: SystemConfig): Promise<CallerResolution> {
  const owner = await readOwnerSession(request, { env: c.env, fetch: c.fetcher });
  if (owner.ok) return { ok: true, caller: { kind: 'owner', ownerId: owner.user.id, email: owner.user.email }, ...(owner.setCookie ? { setCookie: owner.setCookie } : {}) };
  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~-]{20,200})$/i.exec(auth);
  if (match) {
    try {
      const hash = deviceHash(match[1], c.pepper);
      const r = await c.fetcher(`${c.url}/rest/v1/devices?select=id,owner_id&token_hash=eq.${hash}&revoked_at=is.null&limit=1`, {
        headers: { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}` },
      });
      if (!r.ok) return { ok: false, status: 503, code: 'unavailable', message: 'device authentication is unavailable' };
      const rows = await r.json() as { id?: string; owner_id?: string }[];
      if (Array.isArray(rows) && rows[0]?.id && rows[0]?.owner_id) return { ok: true, caller: { kind: 'device', deviceId: rows[0].id, ownerId: rows[0].owner_id } };
    } catch { return { ok: false, status: 503, code: 'unavailable', message: 'device authentication is unavailable' }; }
  }
  if (owner.status === 503) return { ok: false, status: 503, code: 'unavailable', message: owner.message };
  if (owner.status === 403) return { ok: false, status: 403, code: 'forbidden', message: owner.message };
  return { ok: false, status: 401, code: 'unauthorized', message: 'owner session or paired device token is required' };
}
function preserveRotatedSession(response: Response, actor: CallerResolution & { ok: true }): Response {
  if (!actor.setCookie) return response;
  const headers = new Headers(response.headers);
  headers.set('set-cookie', actor.setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function serviceHeaders(c: SystemConfig, extra: Record<string, string> = {}) {
  return { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}`, 'content-type': 'application/json', ...extra };
}
function killStore(c: SystemConfig): KillSwitchStore {
  return {
    async read(ownerId) {
      const url = new URL(`${c.url}/rest/v1/system_state`);
      url.search = new URLSearchParams({ select: 'kill,epoch,changed_at', owner_id: `eq.${ownerId}`, id: 'eq.1', limit: '1' }).toString();
      const r = await c.fetcher(url, { headers: serviceHeaders(c) });
      if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
      const rows = await r.json() as any[];
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },
    async write(ownerId, kill, changedBy, reason) {
      const r = await c.fetcher(`${c.url}/rest/v1/rpc/set_system_kill`, {
        method: 'POST', headers: serviceHeaders(c),
        body: JSON.stringify({ p_owner_id: ownerId, p_kill: kill, p_changed_by: changedBy, p_reason: reason ?? null }),
      });
      if (!r.ok) throw new Error(`Supabase HTTP ${r.status}`);
      const value = await r.json();
      const row = Array.isArray(value) ? value[0] : value;
      return row && typeof row === 'object' ? row as any : null;
    },
  };
}

export async function getKillState(request: Request, options: SystemOptions = {}): Promise<Response> {
  const m = method(request, 'GET'); if (m) return m;
  const c = config(options); if (!c) return fail(503, 'unavailable', 'system API is not configured; safety is treated as ON');
  const actor = await resolveCaller(request, c); if (!actor.ok) return fail(actor.status, actor.code, actor.message);
  const state = await readKillSwitch(killStore(c), actor.caller.ownerId);
  if (!state.ok) return preserveRotatedSession(fail(503, 'unavailable', 'kill switch could not be read; all actions must remain blocked'), actor);
  return preserveRotatedSession(json(200, { ok: true, data: state.state }, { 'cache-control': 'no-store' }), actor);
}

export async function updateKillState(request: Request, options: SystemOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options); if (!c) return fail(503, 'unavailable', 'system API is not configured; safety is treated as ON');
  const actor = await resolveCaller(request, c); if (!actor.ok) return fail(actor.status, actor.code, actor.message);
  const body = await bodyJson(request);
  if (!body || typeof body.kill !== 'boolean' || (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500)) || Object.keys(body).some((k) => !['kill', 'reason'].includes(k))) {
    return preserveRotatedSession(fail(400, 'bad_request', 'body must contain kill:boolean and optional reason (max 500 characters)'), actor);
  }
  const result = await setKillSwitch(killStore(c), actor.caller, body.kill, body.reason);
  if (!result.ok) return preserveRotatedSession(result.code === 'forbidden' ? fail(403, 'forbidden', 'a paired device may only turn the kill switch ON') : fail(503, 'unavailable', 'kill switch update failed; safety remains ON'), actor);
  return preserveRotatedSession(json(200, { ok: true, data: result.state }, { 'cache-control': 'no-store' }), actor);
}

export async function createEvent(request: Request, options: SystemOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options); if (!c) return fail(503, 'unavailable', 'system API is not configured');
  const actor = await resolveCaller(request, c); if (!actor.ok) return fail(actor.status, actor.code, actor.message);
  const event = await bodyJson(request);
  if (!event || typeof event !== 'object' || Array.isArray(event)) return preserveRotatedSession(fail(400, 'bad_request', 'event envelope must be a JSON object'), actor);
  if (actor.caller.kind === 'device') event.source = `phone.${actor.caller.deviceId}`;
  const store = supabaseEventStore({ url: c.url, serviceKey: c.serviceKey, fetch: c.fetcher, limitPerMinute: 60 });
  const result = await emitEvent(store, actor.caller.ownerId, event);
  if (!result.ok) {
    const status = result.code === 'bad_request' ? 400 : result.code === 'payload_too_large' ? 413 : result.code === 'rate_limited' ? 429 : 503;
    return preserveRotatedSession(fail(status, result.code, result.message), actor);
  }
  return preserveRotatedSession(json(200, { ok: true, data: result }, { 'cache-control': 'no-store' }), actor);
}

export async function listEvents(request: Request, options: SystemOptions = {}): Promise<Response> {
  const m = method(request, 'POST'); if (m) return m;
  const c = config(options); if (!c) return fail(503, 'unavailable', 'system API is not configured');
  const actor = await resolveCaller(request, c); if (!actor.ok) return fail(actor.status, actor.code, actor.message);
  if (actor.caller.kind !== 'owner') return fail(403, 'forbidden', 'only the owner can read event history');
  const body = await bodyJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !['type', 'before', 'limit'].includes(k)) || (body.type !== undefined && (typeof body.type !== 'string' || body.type.length > 100)) || (body.before !== undefined && (typeof body.before !== 'string' || Number.isNaN(Date.parse(body.before)))) || (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 200))) {
    return preserveRotatedSession(fail(400, 'bad_request', 'invalid event list filter'), actor);
  }
  try {
    const store = supabaseEventStore({ url: c.url, serviceKey: c.serviceKey, fetch: c.fetcher });
    const events = await store.list(actor.caller.ownerId, { type: body.type, before: body.before, limit: body.limit ?? 50 });
    return preserveRotatedSession(json(200, { ok: true, data: { events } }, { 'cache-control': 'no-store' }), actor);
  } catch { return preserveRotatedSession(fail(503, 'unavailable', 'event history is unavailable'), actor); }
}

export const deviceTokenHash = deviceHash;
