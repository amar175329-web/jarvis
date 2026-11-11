import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerSession, readOwnerSession, getOwnerSessionResponse, deleteOwnerSession, SESSION_COOKIE } from '../index.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const env = { SUPABASE_URL: 'https://jarvis.supabase.co', SUPABASE_ANON_KEY: 'anon-key-for-tests', OWNER_EMAIL: 'amit@example.com' };
const ownerFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    const token = new Headers(init?.headers).get('authorization');
    if (token === 'Bearer expired-token-123456789012345') return Response.json({ msg: 'expired' }, { status: 401 });
    if (token !== 'Bearer owner-access-token-123456789') return Response.json({ msg: 'bad token' }, { status: 401 });
    return Response.json({ id: OWNER_ID, email: 'Amit@Example.com' });
  }
  if (url.includes('/auth/v1/token?grant_type=refresh_token')) return Response.json({ access_token: 'owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789' });
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
