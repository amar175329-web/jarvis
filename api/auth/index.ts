import { Buffer } from 'node:buffer';

export const SESSION_COOKIE = 'jarvis_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const ACCESS_ONLY_MAX_AGE = 60 * 60;
const MAX_BODY_BYTES = 10 * 1024;

type AuthUser = { id: string; email: string };
type CookieSession = { access_token: string; refresh_token?: string; issued_at: number };
type AuthOptions = { env?: Record<string, string | undefined>; fetch?: typeof fetch };
type SessionResult =
  | { ok: true; user: AuthUser; expiresIn: number; setCookie?: string }
  | { ok: false; status: 401 | 403 | 503; message: string; clearCookie?: boolean };

function config(o: AuthOptions) {
  const env = o.env ?? process.env;
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !anonKey || !ownerEmail) return null;
  return { url, anonKey, ownerEmail, fetcher: o.fetch ?? fetch };
}

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers });
}
function error(status: number, code: string, message: string, headers: HeadersInit = {}) {
  return json(status, { ok: false, error: { code, message } }, headers);
}
function setCookie(session: CookieSession, hasRefresh: boolean) {
  const value = Buffer.from(JSON.stringify(session)).toString('base64url');
  const age = hasRefresh ? SESSION_MAX_AGE : ACCESS_ONLY_MAX_AGE;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function cookieValue(header: string | null): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== SESSION_COOKIE) continue;
    return part.slice(i + 1).trim() || null;
  }
  return null;
}
function decodeCookie(header: string | null): CookieSession | null {
  const raw = cookieValue(header);
  if (!raw || raw.length > 12_000) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<CookieSession>;
    if (typeof v.access_token !== 'string' || v.access_token.length < 20 || v.access_token.length > 4096) return null;
    if (v.refresh_token !== undefined && (typeof v.refresh_token !== 'string' || v.refresh_token.length < 20 || v.refresh_token.length > 4096)) return null;
    return { access_token: v.access_token, ...(v.refresh_token ? { refresh_token: v.refresh_token } : {}), issued_at: Number.isFinite(v.issued_at) ? Number(v.issued_at) : 0 };
  } catch { return null; }
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser server clients; cookies remain SameSite=Lax.
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
async function readJson(request: Request): Promise<any | null> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function verifyAccessToken(token: string, o: NonNullable<ReturnType<typeof config>>): Promise<{ ok: true; user: AuthUser } | { ok: false; status: 401 | 503 }> {
  try {
    const r = await o.fetcher(`${o.url}/auth/v1/user`, { headers: { apikey: o.anonKey, Authorization: `Bearer ${token}` } });
    if (r.status === 401 || r.status === 403) return { ok: false, status: 401 };
    if (!r.ok) return { ok: false, status: 503 };
    const u = await r.json() as { id?: unknown; email?: unknown };
    if (typeof u.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u.id) || typeof u.email !== 'string') return { ok: false, status: 401 };
    return { ok: true, user: { id: u.id, email: u.email.trim().toLowerCase() } };
  } catch { return { ok: false, status: 503 }; }
}
async function refreshSession(session: CookieSession, o: NonNullable<ReturnType<typeof config>>): Promise<{ ok: true; session: CookieSession } | { ok: false; status: 401 | 503 }> {
  if (!session.refresh_token) return { ok: false, status: 401 };
  try {
    const r = await o.fetcher(`${o.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: o.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, status: 401 };
    if (!r.ok) return { ok: false, status: 503 };
    const tokens = await r.json() as { access_token?: unknown; refresh_token?: unknown };
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length < 20 || tokens.access_token.length > 4096 || typeof tokens.refresh_token !== 'string' || tokens.refresh_token.length < 20 || tokens.refresh_token.length > 4096) return { ok: false, status: 503 };
    return { ok: true, session: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, issued_at: Date.now() } };
  } catch { return { ok: false, status: 503 }; }
}

export async function createOwnerSession(request: Request, options: AuthOptions = {}): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'bad_request', 'method not allowed', { Allow: 'POST' });
  if (!sameOrigin(request)) return error(403, 'forbidden', 'cross-origin session creation is not allowed');
  const o = config(options);
  if (!o) return error(503, 'unavailable', 'authentication is not configured');
  const body = await readJson(request);
  if (!body || typeof body.access_token !== 'string' || body.access_token.length < 20 || body.access_token.length > 4096 || (body.refresh_token !== undefined && (typeof body.refresh_token !== 'string' || body.refresh_token.length < 20 || body.refresh_token.length > 4096)) || Object.keys(body).some((k) => !['access_token', 'refresh_token'].includes(k))) {
    return error(400, 'bad_request', 'a valid Supabase access_token and optional refresh_token are required');
  }
  const verified = await verifyAccessToken(body.access_token, o);
  if (!verified.ok) return error(verified.status, verified.status === 401 ? 'unauthorized' : 'unavailable', verified.status === 401 ? 'Supabase session is invalid' : 'authentication provider is unavailable');
  if (verified.user.email !== o.ownerEmail) return error(403, 'forbidden', 'this account is not the configured JARVIS owner');
  const session: CookieSession = { access_token: body.access_token, ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}), issued_at: Date.now() };
  return json(200, { ok: true, data: { user: verified.user, expires_in: body.refresh_token ? SESSION_MAX_AGE : ACCESS_ONLY_MAX_AGE } }, { 'set-cookie': setCookie(session, Boolean(body.refresh_token)), 'cache-control': 'no-store' });
}

export async function readOwnerSession(request: Request, options: AuthOptions = {}): Promise<SessionResult> {
  const o = config(options);
  if (!o) return { ok: false, status: 503, message: 'authentication is not configured' };
  let session = decodeCookie(request.headers.get('cookie'));
  if (!session) return { ok: false, status: 401, message: 'owner session is missing', clearCookie: true };
  let verified = await verifyAccessToken(session.access_token, o);
  let rotated = false;
  if (!verified.ok && verified.status === 401 && session.refresh_token) {
    const refreshed = await refreshSession(session, o);
    if (!refreshed.ok) return { ok: false, status: refreshed.status, message: refreshed.status === 401 ? 'owner session expired' : 'authentication provider is unavailable', clearCookie: refreshed.status === 401 };
    session = refreshed.session; rotated = true;
    verified = await verifyAccessToken(session.access_token, o);
  }
  if (!verified.ok) return { ok: false, status: verified.status, message: verified.status === 401 ? 'owner session is invalid' : 'authentication provider is unavailable', clearCookie: verified.status === 401 };
  if (verified.user.email !== o.ownerEmail) return { ok: false, status: 403, message: 'this account is not the configured JARVIS owner', clearCookie: true };
  const expiresIn = session.refresh_token ? SESSION_MAX_AGE : Math.max(0, ACCESS_ONLY_MAX_AGE - Math.floor((Date.now() - session.issued_at) / 1000));
  return { ok: true, user: verified.user, expiresIn, ...(rotated ? { setCookie: setCookie(session, true) } : {}) };
}

export async function getOwnerSessionResponse(request: Request, options: AuthOptions = {}): Promise<Response> {
  if (request.method !== 'GET') return error(405, 'bad_request', 'method not allowed', { Allow: 'GET' });
  const result = await readOwnerSession(request, options);
  if (!result.ok) return error(result.status, result.status === 401 ? 'unauthorized' : result.status === 403 ? 'forbidden' : 'unavailable', result.message, result.clearCookie ? { 'set-cookie': clearSessionCookie() } : {});
  return json(200, { ok: true, data: { user: result.user, expires_in: result.expiresIn } }, { 'cache-control': 'no-store', ...(result.setCookie ? { 'set-cookie': result.setCookie } : {}) });
}

export async function deleteOwnerSession(request: Request, options: AuthOptions = {}): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'bad_request', 'method not allowed', { Allow: 'POST' });
  const o = config(options);
  const session = decodeCookie(request.headers.get('cookie'));
  if (session && o) {
    try {
      await o.fetcher(`${o.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: o.anonKey, Authorization: `Bearer ${session.access_token}` } });
    } catch { /* Always clear the local cookie, even if Supabase is unreachable. */ }
  }
  return json(200, { ok: true, data: { signed_out: true } }, { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' });
}
