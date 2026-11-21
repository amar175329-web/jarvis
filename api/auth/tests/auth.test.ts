import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerSession, readOwnerSession, getOwnerSessionResponse, deleteOwnerSession, ownerEnter, computeOwnerEnterDelayMs, SESSION_COOKIE } from '../index.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://jarvis.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-for-tests',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests',
  OWNER_EMAIL: 'amit@example.com',
  OWNER_PASSWORD: 'correct-password',
  OWNER_ENTRY_KEY: 'secret-entry-key-for-tests-123456789',
};

function createMockSupabaseFetch(opts: { failDb?: 'http500' | 'throw' } = {}): typeof fetch {
  // Simulates public.owner_enter_attempts table shared across all module instances
  const attempts: Array<{ ip: string; at: number }> = [];
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rest/v1/rpc/check_owner_enter_rate_limit') || url.endsWith('/rest/v1/rpc/record_owner_enter_failure')) {
      if (opts.failDb === 'throw') throw new Error('ECONNREFUSED');
      if (opts.failDb === 'http500') return Response.json({ message: 'db down' }, { status: 500 });
      const headers = new Headers(init?.headers);
      if (headers.get('apikey') !== env.SUPABASE_SERVICE_ROLE_KEY || headers.get('authorization') !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
        return Response.json({ message: 'permission denied' }, { status: 401 });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        p_ip: string;
        p_window_seconds: number;
        p_ip_limit: number;
        p_global_limit: number;
      };
      const now = Date.now();
      const cutoff = now - body.p_window_seconds * 1000;
      if (url.endsWith('/record_owner_enter_failure')) {
        attempts.push({ ip: body.p_ip, at: now });
      }
      const recent = attempts.filter((a) => a.at > cutoff);
      const ipCount = recent.filter((a) => a.ip === body.p_ip).length;
      const globalCount = recent.length;
      if (url.endsWith('/check_owner_enter_rate_limit')) {
        return Response.json({
          allowed: ipCount < body.p_ip_limit && globalCount < body.p_global_limit,
          ip_count: ipCount,
          global_count: globalCount,
        });
      }
      return Response.json({
        ip_count: ipCount,
        global_count: globalCount,
        blocked: ipCount >= body.p_ip_limit || globalCount >= body.p_global_limit,
      });
    }
    if (url.endsWith('/auth/v1/user')) {
      const token = new Headers(init?.headers).get('authorization');
      if (token === 'Bearer expired-token-123456789012345') return Response.json({ msg: 'expired' }, { status: 401 });
      if (token !== 'Bearer owner-access-token-123456789') return Response.json({ msg: 'bad token' }, { status: 401 });
      return Response.json({ id: OWNER_ID, email: 'Amit@Example.com' });
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) return Response.json({ access_token: 'owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789' });
    if (url.includes('/auth/v1/token?grant_type=password')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.email === 'amit@example.com' && body.password === 'correct-password') {
        return Response.json({ access_token: 'owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789' });
      }
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    if (url.endsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  };
}

const ownerFetch: typeof fetch = createMockSupabaseFetch();
const noopSleep = async () => {};
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`https://jarvis.example${path}`, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const getCookie = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];

test('session create verifies token and sets Secure HttpOnly SameSite cookie without returning token', async () => {
  const r = await createOwnerSession(req('POST', '/api/auth/session.create', { access_token: 'owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789' }), { env, fetch: ownerFetch });
  assert.equal(r.status, 200);
  const responseText = await r.text();
  assert.deepEqual(JSON.parse(responseText).data.user, { id: OWNER_ID, email: 'amit@example.com' });
  assert.doesNotMatch(responseText, /owner-access-token|owner-refresh-token/);
  assert.match(r.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(r.headers.get('set-cookie')!.startsWith(`${SESSION_COOKIE}=`));
});
test('session create refuses non-owner account even when Supabase signup is enabled', async () => {
  const fetcher: typeof fetch = async () => Response.json({ id: OWNER_ID, email: 'other@example.com' });
  const r = await createOwnerSession(req('POST', '/', { access_token: 'some-access-token-123456789' }), { env, fetch: fetcher });
  assert.equal(r.status, 403);
});
test('session create refuses invalid token and malformed input', async () => {
  const badToken = await createOwnerSession(req('POST', '/', { access_token: 'bad-access-token-123456789' }), { env, fetch: ownerFetch });
  assert.equal(badToken.status, 401);
  const badBody = await createOwnerSession(req('POST', '/', { password: 'not-supported' }), { env, fetch: ownerFetch });
  assert.equal(badBody.status, 400);
});
test('session create rejects cross-origin browser requests', async () => {
  const r = await createOwnerSession(req('POST', '/', { access_token: 'owner-access-token-123456789' }, { origin: 'https://evil.example' }), { env, fetch: ownerFetch });
  assert.equal(r.status, 403);
});
test('session create fails safely when auth env is incomplete', async () => {
  const r = await createOwnerSession(req('POST', '/', { access_token: 'owner-access-token-123456789' }), { env: { ...env, OWNER_EMAIL: '' }, fetch: ownerFetch });
  assert.equal(r.status, 503);
});
test('owner session can be read from cookie', async () => {
  const created = await createOwnerSession(req('POST', '/', { access_token: 'owner-access-token-123456789' }), { env, fetch: ownerFetch });
  const session = await readOwnerSession(req('GET', '/', undefined, { cookie: getCookie(created) }), { env, fetch: ownerFetch });
  assert.ok(session.ok && session.user.id === OWNER_ID);
});
test('expired access token refreshes and rotates the cookie', async () => {
  const raw = Buffer.from(JSON.stringify({ access_token: 'expired-token-123456789012345', refresh_token: 'owner-refresh-token-123456789', issued_at: 1 })).toString('base64url');
  const r = await getOwnerSessionResponse(req('GET', '/', undefined, { cookie: `${SESSION_COOKIE}=${raw}` }), { env, fetch: ownerFetch });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie')!, /Max-Age=604800/);
});
test('missing cookie is unauthorized and explicitly cleared', async () => {
  const r = await getOwnerSessionResponse(req('GET', '/'), { env, fetch: ownerFetch });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('set-cookie')!, /Max-Age=0/);
});
test('delete clears local cookie and signs out remotely', async () => {
  let loggedOut = false;
  const fetcher: typeof fetch = async (_u, init) => { if (init?.method === 'POST') loggedOut = true; return new Response(null, { status: 204 }); };
  const r = await deleteOwnerSession(req('POST', '/', undefined, { cookie: `${SESSION_COOKIE}=invalid` }), { env, fetch: fetcher });
  assert.equal(r.status, 200); assert.equal(loggedOut, false);
  assert.match(r.headers.get('set-cookie')!, /Max-Age=0/);
});
test('wrong HTTP methods are rejected', async () => {
  assert.equal((await createOwnerSession(req('GET', '/'), { env, fetch: ownerFetch })).status, 405);
  assert.equal((await getOwnerSessionResponse(req('POST', '/'), { env, fetch: ownerFetch })).status, 405);
});

// P21 Security Tests
test('P21 (a)/(c): OWNER_PASSWORD set ho tab bhi anonymous session.get => 401', async () => {
  const r = await getOwnerSessionResponse(req('GET', '/api/auth/session.get'), { env, fetch: ownerFetch });
  assert.equal(r.status, 401, 'Anonymous request must return 401 even when OWNER_PASSWORD is set');
  const body = await r.json();
  assert.equal(body.ok, false);
});

test('P21 (d) / P22 C6(iv): owner.enter galat key => 401 bina hint; sahi key => cookie + session.get 200', async () => {
  const sharedDbFetch = createMockSupabaseFetch();
  const delays: number[] = [];
  const badRes = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: 'wrong-key-guess' }, { 'x-forwarded-for': '203.0.113.5' }),
    { env, fetch: sharedDbFetch, sleep: async (ms) => { delays.push(ms); } },
  );
  assert.equal(badRes.status, 401);
  assert.equal(badRes.headers.get('set-cookie'), null);
  const badText = await badRes.text();
  const badBody = JSON.parse(badText);
  assert.deepEqual(badBody, { ok: false, error: { code: 'unauthorized', message: 'unauthorized' } });
  assert.doesNotMatch(badText, /key|password|email|attempt|remaining|hint|length/i);
  assert.deepEqual(delays, [200]);

  const goodRes = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, { 'x-forwarded-for': '203.0.113.5' }),
    { env, fetch: sharedDbFetch, sleep: noopSleep },
  );
  assert.equal(goodRes.status, 200);
  const cookie = goodRes.headers.get('set-cookie');
  assert.ok(cookie, 'Cookie must be set on successful owner.enter');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Max-Age=2592000/i);

  const sessionRes = await getOwnerSessionResponse(req('GET', '/api/auth/session.get', undefined, { cookie: cookie.split(';')[0] }), { env, fetch: sharedDbFetch });
  assert.equal(sessionRes.status, 200);
  const sessionBody = await sessionRes.json();
  assert.equal(sessionBody.ok, true);
  assert.equal(sessionBody.data.user.email, 'amit@example.com');
});

// P22 C6(i): 2 separate module instances share DB rate limit; 12 wrong attempts => 6th+ return 429 on BOTH instances (even with correct key)
test('P22 C6(i): 2 module instances (?a=1, ?b=2) se 12 galat => 6th ke baad dono 429 (sahi key bhi 429)', async () => {
  const modA = await import('../index.ts?a=1');
  const modB = await import('../index.ts?b=2');
  assert.notEqual(modA, modB, 'Must be two distinct ESM module instances');

  const sharedDbFetch = createMockSupabaseFetch();
  const delays: number[] = [];
  const ipHeaders = { 'x-forwarded-for': '203.0.113.42, 10.0.0.1' };

  for (let i = 1; i <= 12; i++) {
    const fn = i % 2 === 1 ? modA.ownerEnter : modB.ownerEnter;
    const res = await fn(
      req('POST', '/api/auth/owner.enter', { key: `wrong-attempt-${i}` }, ipHeaders),
      { env, fetch: sharedDbFetch, sleep: async (ms) => { delays.push(ms); } },
    );
    if (i <= 5) {
      assert.equal(res.status, 401, `Attempt ${i} should return 401`);
    } else {
      assert.equal(res.status, 429, `Attempt ${i} across 2 instances must return 429`);
    }
  }
  assert.deepEqual(delays, [200, 400, 800, 1600, 3200]);

  // Once rate limited, even the CORRECT key from either instance must return 429
  const correctOnA = await modA.ownerEnter(req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, ipHeaders), { env, fetch: sharedDbFetch, sleep: noopSleep });
  const correctOnB = await modB.ownerEnter(req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, ipHeaders), { env, fetch: sharedDbFetch, sleep: noopSleep });
  assert.equal(correctOnA.status, 429, 'Correct key must return 429 when per-IP limit reached (instance A)');
  assert.equal(correctOnB.status, 429, 'Correct key must return 429 when per-IP limit reached (instance B)');
});

// P22 C6(ii): Rotating X-Forwarded-For hits global limit (20 / 10 min) => 429 even for new IP & correct key
test('P22 C6(ii): rotating X-Forwarded-For hits global limit => 429 (and exponential delay caps at 5000ms)', async () => {
  const sharedDbFetch = createMockSupabaseFetch();
  const delays: number[] = [];

  for (let i = 1; i <= 24; i++) {
    const spoofedIp = `198.51.100.${i}`;
    const res = await ownerEnter(
      req('POST', '/api/auth/owner.enter', { key: `wrong-rot-${i}` }, { 'x-forwarded-for': spoofedIp }),
      { env, fetch: sharedDbFetch, sleep: async (ms) => { delays.push(ms); } },
    );
    if (i <= 20) {
      assert.equal(res.status, 401, `Rotating IP attempt ${i} should return 401`);
    } else {
      assert.equal(res.status, 429, `Rotating IP attempt ${i} must hit global 429`);
    }
  }
  // Verify exponential delay capped at 5000ms
  assert.equal(delays[0], 200);
  assert.equal(delays[4], 3200);
  assert.equal(delays[5], 5000);
  assert.equal(delays[19], 5000);
  assert.equal(computeOwnerEnterDelayMs(100), 5000);

  // Even a brand new IP with the CORRECT key must return 429 once global limit is reached
  const freshCorrect = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, { 'x-forwarded-for': '198.51.100.250' }),
    { env, fetch: sharedDbFetch, sleep: noopSleep },
  );
  assert.equal(freshCorrect.status, 429, 'Correct key from fresh IP must return 429 when global limit reached');
});

// P22 C6(iii): DB down / error => fail-closed 503
test('P22 C6(iii): DB error or missing service key => fail-closed 503', async () => {
  const res500 = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, { 'x-forwarded-for': '203.0.113.99' }),
    { env, fetch: createMockSupabaseFetch({ failDb: 'http500' }), sleep: noopSleep },
  );
  assert.equal(res500.status, 503, 'HTTP 500 from DB RPC must fail-closed with 503');

  const resThrow = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, { 'x-forwarded-for': '203.0.113.99' }),
    { env, fetch: createMockSupabaseFetch({ failDb: 'throw' }), sleep: noopSleep },
  );
  assert.equal(resThrow.status, 503, 'Network error talking to DB must fail-closed with 503');

  const resNoKey = await ownerEnter(
    req('POST', '/api/auth/owner.enter', { key: env.OWNER_ENTRY_KEY }, { 'x-forwarded-for': '203.0.113.99' }),
    { env: { ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, fetch: ownerFetch, sleep: noopSleep },
  );
  assert.equal(resNoKey.status, 503, 'Missing SUPABASE_SERVICE_ROLE_KEY must fail-closed with 503');
});
