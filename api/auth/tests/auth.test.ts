import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerSession, readOwnerSession, getOwnerSessionResponse, deleteOwnerSession, ownerEnter, resetOwnerEnterRateLimits, SESSION_COOKIE } from '../index.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://jarvis.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-for-tests',
  OWNER_EMAIL: 'amit@example.com',
  OWNER_PASSWORD: 'correct-password',
  OWNER_ENTRY_KEY: 'secret-entry-key-for-tests-123456789',
};
const ownerFetch: typeof fetch = async (input, init) => {
  const url = String(input);
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

test('P21 (d): owner.enter galat key => 401 bina hint; sahi key => cookie + session.get 200', async () => {
  resetOwnerEnterRateLimits?.();
  // Wrong key
  const badRes = await ownerEnter(req('POST', '/api/auth/owner.enter', { key: 'wrong-key-guess' }), { env, fetch: ownerFetch });
  assert.equal(badRes.status, 401);
  assert.equal(badRes.headers.get('set-cookie'), null);
  const badBody = await badRes.json();
  assert.equal(badBody.ok, false);

  // Correct key
  const goodRes = await ownerEnter(req('POST', '/api/auth/owner.enter', { key: 'secret-entry-key-for-tests-123456789' }), { env, fetch: ownerFetch });
  assert.equal(goodRes.status, 200);
  const cookie = goodRes.headers.get('set-cookie');
  assert.ok(cookie, 'Cookie must be set on successful owner.enter');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Max-Age=2592000/i); // 30 days = 30 * 24 * 60 * 60

  // Verify session.get works with this cookie
  const sessionRes = await getOwnerSessionResponse(req('GET', '/api/auth/session.get', undefined, { cookie: cookie.split(';')[0] }), { env, fetch: ownerFetch });
  assert.equal(sessionRes.status, 200);
  const sessionBody = await sessionRes.json();
  assert.equal(sessionBody.ok, true);
  assert.equal(sessionBody.data.user.email, 'amit@example.com');
});

test('P21 (e): owner.enter 6th galat koshish => 429', async () => {
  resetOwnerEnterRateLimits?.();
  const testIpHeaders = { 'x-forwarded-for': '203.0.113.42' };
  for (let i = 1; i <= 5; i++) {
    const res = await ownerEnter(req('POST', '/api/auth/owner.enter', { key: `wrong-attempt-${i}` }, testIpHeaders), { env, fetch: ownerFetch });
    assert.equal(res.status, 401, `Attempt ${i} should return 401`);
  }
  // 6th attempt from same IP
  const sixthRes = await ownerEnter(req('POST', '/api/auth/owner.enter', { key: 'wrong-attempt-6' }, testIpHeaders), { env, fetch: ownerFetch });
  assert.equal(sixthRes.status, 429, '6th wrong attempt within 10 min must return 429');
});
