import { readOwnerSession, clearSessionCookie } from '../../../../api/auth/index.ts';
import { makeRegistry, type Power } from '../../../../packages/brain/src/power-registry.ts';
import { gate } from '../../../../packages/brain/src/gate.ts';

export type Owner = { user: { id: string; email?: string }; accessToken: string; setCookie?: string };
export type RuntimeOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  resolveOwner?: typeof readOwnerSession;
};
export type Config = { url: string; anonKey: string; env: Record<string, string | undefined>; fetcher: typeof fetch };

export function runtimeConfig(options: RuntimeOptions = {}): Config | null {
  const env = options.env ?? process.env;
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey, env, fetcher: options.fetch ?? fetch };
}

export function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...Object.fromEntries(new Headers(headers).entries()) } });
}
export function fail(status: number, code: string, message: string) {
  return json(status, { ok: false, error: { code, message } });
}
export function success(data: unknown, status = 200) {
  return json(status, { ok: true, data });
}
export function withCookie(response: Response, cookie?: string) {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.set('set-cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function resolveOwner(request: Request, options: RuntimeOptions, config: Config) {
  const resolve = options.resolveOwner ?? readOwnerSession;
  const owner = await resolve(request, { env: config.env, fetch: config.fetcher });
  if (!owner.ok) {
    const status = owner.status;
    return {
      ok: false as const,
      response: fail(status, status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'unavailable', owner.message),
      clearCookie: owner.clearCookie ? clearSessionCookie() : undefined,
    };
  }
  return { ok: true as const, owner: owner as Owner };
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 12000) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 12000) return null;
    const body = raw.trim() ? JSON.parse(raw) : {};
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}

/** PostgREST requests always use anon key + the verified owner's bearer; never a service key. */
export async function dbRows(
  config: Config,
  owner: Owner,
  table: string,
  query: Record<string, string>,
  options: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<Record<string, any>[]> {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.search = new URLSearchParams(query).toString();
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    Authorization: `Bearer ${owner.accessToken}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await config.fetcher(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw new Error(`owner database request failed (${response.status})`);
  if (response.status === 204) return [];
  const raw = await response.text();
  if (!raw.trim()) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('database result is not a row list');
  return rows;
}

/**
 * Read endpoints still require a registered S22 power and a healthy kill-switch read.
 * L0/L1 observation is permitted only because the operation is read-only and returns
 * redacted projections. This helper is not for mutations; those must use executePower().
 */
export async function requireReadPower(config: Config, owner: Owner, powerId: string, confirmed = false): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  try {
    const [powerRows, killRows] = await Promise.all([
      dbRows(config, owner, 'powers', {
        select: 'id,name,owner_squad,description,autonomy_default,autonomy_current,max_level,needs_confirm,reversible,tags',
        id: `eq.${powerId}`, owner_id: `eq.${owner.user.id}`, limit: '1',
      }),
      dbRows(config, owner, 'system_state', {
        select: 'kill,epoch', id: 'eq.1', owner_id: `eq.${owner.user.id}`, limit: '1',
      }),
    ]);
    const killRow = killRows[0];
    const kill = killRow && typeof killRow.kill === 'boolean'
      ? (killRow.kill ? 'on' : 'off')
      : 'unreadable';
    const registry = makeRegistry(powerRows as Power[]);
    const decision = gate(registry, powerId, kill);
    if (decision.mode === 'deny') {
      return { ok: false, status: 403, code: 'forbidden', message: `Read blocked by JARVIS safety gate: ${decision.reason}` };
    }
    if (decision.mode === 'ask_confirm' && !confirmed) {
      return { ok: false, status: 409, code: 'confirmation_required', message: 'L2 read power ke liye explicit confirmation chahiye.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, code: 'unavailable', message: 'Power registry or kill switch unavailable; read blocked.' };
  }
}

export async function insertActivityRow(config: Config, owner: Owner, row: Record<string, unknown>) {
  const rows = await dbRows(config, owner, 'activity_log', {}, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
  return rows[0] ?? {};
}

/** Adapter squads can reuse after their own owner session has been verified. */
export function createActivityLogWriter(config: Config, owner: Owner) {
  return {
    insert: (row: Record<string, unknown>) => insertActivityRow(config, owner, row),
  };
}
