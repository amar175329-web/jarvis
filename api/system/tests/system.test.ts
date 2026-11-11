import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createOwnerSession } from '../../auth/index.ts';
import { createEvent, getKillState, listEvents, updateKillState, deviceTokenHash } from '../index.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const DEVICE_ID = '00000000-0000-4000-8000-000000000002';
const TOKEN = 'device-token-abcdefghijklmnopqrstu';
const PEPPER = 'p'.repeat(48);
const ENV = {
  SUPABASE_URL: 'https://jarvis.supabase.co', SUPABASE_ANON_KEY: 'anon-key-for-tests',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests', OWNER_EMAIL: 'amit@example.com', DEVICE_TOKEN_PEPPER: PEPPER,
};

function setup(opts: { rate?: boolean; databaseFail?: boolean } = {}) {
  let state = { kill: false, epoch: 0, changed_at: '2026-11-07T00:00:00.000Z' };
  let inserted: any = null;
  let auditCount = 0;
  const calls: { url: string; method: string; body?: any; headers?: Headers }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input); const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body, headers: new Headers(init.headers) });
    if (opts.databaseFail && url.includes('/rest/v1/') && !url.includes('/rest/v1/devices?')) return Response.json({ message: 'db down' }, { status: 503 });
    if (url.endsWith('/auth/v1/user')) {
      const auth = new Headers(init.headers).get('authorization');
      return auth === 'Bearer owner-access-token-123456789' ? Response.json({ id: OWNER_ID, email: 'amit@example.com' }) : Response.json({}, { status: 401 });
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) return Response.json({ access_token: 'owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789' });
    if (url.includes('/rest/v1/devices?')) {
      const hash = new URL(url).searchParams.get('token_hash');
      const expected = createHash('sha256').update(`${PEPPER}:${TOKEN}`).digest('hex');
      return Response.json(hash === `eq.${expected}` ? [{ id: DEVICE_ID, owner_id: OWNER_ID }] : []);
    }
    if (url.includes('/rest/v1/system_state?')) return Response.json([state]);
    if (url.endsWith('/rest/v1/rpc/set_system_kill')) {
      if (state.kill !== body.p_kill) state = { kill: body.p_kill, epoch: state.epoch + 1, changed_at: new Date().toISOString() };
      auditCount++;
      return Response.json(state);
    }
    if (url.endsWith('/rest/v1/rpc/consume_event_rate_limit')) return Response.json(opts.rate !== false);
    if (url.includes('/rest/v1/events?') && method === 'POST') {
      if (inserted?.idempotency_key === body.idempotency_key) return Response.json([]);
      inserted = body;
      return Response.json([{ id: body.id }]);
    }
    if (url.includes('/rest/v1/events?') && method === 'GET') return Response.json(inserted ? [{ id: inserted.id }] : []);
    return Response.json({ message: `unexpected ${method} ${url}` }, { status: 404 });
  };
  return { fetcher, calls, getState: () => state, getInserted: () => inserted, getAuditCount: () => auditCount };
}

async function ownerCookie(fetcher: typeof fetch) {
  const req = new Request('https://jarvis.example/api/auth/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: 'owner-access-token-123456789' }),
  });
  const response = await createOwnerSession(req, { env: ENV, fetch: fetcher });
  assert.equal(response.status, 200);
  return (response.headers.get('set-cookie') ?? '').split(';')[0];
}
const getReq = (path: string, auth: string) => new Request(`https://jarvis.example${path}`, { headers: { authorization: auth } });
const postReq = (path: string, body: unknown, headers: Record<string, string>) => new Request(`https://jarvis.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const mkEvent = (type = 'activity.logged', payload: Record<string, unknown> = { summary: 'saved' }) => ({
  id: randomUUID(), type, source: 'web', ts: new Date().toISOString(), payload, version: 1, idempotency_key: `key-${randomUUID()}`,
});

test('device token lookup uses peppered hash and returns kill state', async () => {
  const x = setup();
  const r = await getKillState(getReq('/api/system/kill.get', `Bearer ${TOKEN}`), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { kill: false, epoch: 0, changed_at: '2026-11-07T00:00:00.000Z' });
  const lookup = x.calls.find((c) => c.url.includes('/devices?'))!;
  assert.match(lookup.url, new RegExp(deviceTokenHash(TOKEN, PEPPER)));
  assert.ok(!lookup.url.includes(TOKEN));
});
test('device can turn kill ON and DB function writes audit atomically', async () => {
  const x = setup();
  const r = await updateKillState(postReq('/api/system/kill.set', { kill: true, reason: 'phone safety key' }, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data.kill, true);
  assert.equal(x.getState().epoch, 1);
  assert.equal(x.getAuditCount(), 1);
  assert.equal(x.calls.find((c) => c.url.endsWith('/rpc/set_system_kill'))?.body.p_changed_by, `device:${DEVICE_ID}`);
});
test('device is forbidden from turning kill OFF; no DB write occurs', async () => {
  const x = setup();
  await updateKillState(postReq('/api/system/kill.set', { kill: true }, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  const before = x.calls.filter((c) => c.url.endsWith('/rpc/set_system_kill')).length;
  const r = await updateKillState(postReq('/api/system/kill.set', { kill: false }, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 403);
  assert.equal(x.getState().kill, true);
  assert.equal(x.calls.filter((c) => c.url.endsWith('/rpc/set_system_kill')).length, before);
});
test('owner session can turn kill OFF and route returns the new state', async () => {
  const x = setup();
  await updateKillState(postReq('/api/system/kill.set', { kill: true }, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  const cookie = await ownerCookie(x.fetcher);
  const r = await updateKillState(postReq('/api/system/kill.set', { kill: false, reason: 'owner confirmed' }, { cookie }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.kill, false);
  assert.equal(x.getState().epoch, 2);
  assert.equal(x.calls.filter((c) => c.url.endsWith('/rpc/set_system_kill')).at(-1)?.body.p_changed_by, 'owner:amit@example.com');
});
test('owner session refresh is rotated on system API responses', async () => {
  const x = setup();
  const raw = Buffer.from(JSON.stringify({ access_token: 'expired-owner-access-token-123456789', refresh_token: 'owner-refresh-token-123456789', issued_at: 1 })).toString('base64url');
  const r = await getKillState(new Request('https://jarvis.example/api/system/kill.get', { headers: { cookie: `jarvis_session=${raw}` } }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie') ?? '', /jarvis_session=.*Max-Age=604800/);
  assert.ok(x.calls.some((c) => c.url.includes('/auth/v1/token?grant_type=refresh_token')));
});
test('kill read failure is 503 and never reports OFF', async () => {
  const x = setup({ databaseFail: true });
  const r = await getKillState(getReq('/api/system/kill.get', `Bearer ${TOKEN}`), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 503);
  assert.match((await r.text()), /blocked/);
});
test('unknown device and missing identity are rejected', async () => {
  const x = setup();
  assert.equal((await getKillState(getReq('/api/system/kill.get', 'Bearer unknown-device-token-123456'), { env: ENV, fetch: x.fetcher })).status, 401);
  assert.equal((await getKillState(new Request('https://jarvis.example/api/system/kill.get'), { env: ENV, fetch: x.fetcher })).status, 401);
});
test('device-originated events get server-owned source and are stored, not realtime-published', async () => {
  const x = setup();
  const event = mkEvent();
  const r = await createEvent(postReq('/api/system/events.emit', event, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  const saved = x.getInserted();
  assert.equal(saved.source, `phone.${DEVICE_ID}`);
  assert.equal(saved.owner_id, OWNER_ID);
  assert.equal(saved.realtime, false);
  assert.ok(x.calls.some((c) => c.url.endsWith('/rpc/consume_event_rate_limit')));
});
test('live-classified event sets only the audit flag; it is still written to events', async () => {
  const x = setup();
  const event = mkEvent('task.created', { task_id: OWNER_ID, title: 'Task' });
  const r = await createEvent(postReq('/api/system/events.emit', event, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  assert.equal(x.getInserted().realtime, true);
  assert.ok(x.getInserted().idempotency_key);
});
test('duplicate event returns original stored id', async () => {
  const x = setup();
  const event = mkEvent();
  const first = await createEvent(postReq('/api/system/events.emit', event, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  const second = await createEvent(postReq('/api/system/events.emit', event, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal((await second.json()).data.duplicate, true);
});
test('event without idempotency_key is refused before storage', async () => {
  const x = setup();
  const event = mkEvent(); delete (event as any).idempotency_key;
  const r = await createEvent(postReq('/api/system/events.emit', event, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 400);
  assert.equal(x.calls.some((c) => c.url.includes('/rest/v1/events?')), false);
});
test('rate limit blocks event inserts and returns 429', async () => {
  const x = setup({ rate: false });
  const r = await createEvent(postReq('/api/system/events.emit', mkEvent(), { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 429);
  assert.equal(x.getInserted(), null);
});
test('DB rate-limit unavailable fails closed and event is not inserted', async () => {
  const x = setup({ databaseFail: true });
  const r = await createEvent(postReq('/api/system/events.emit', mkEvent(), { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 503);
  assert.equal(x.getInserted(), null);
});
test('owner can list events; device cannot read the owner history', async () => {
  const x = setup();
  const cookie = await ownerCookie(x.fetcher);
  const r = await listEvents(postReq('/api/system/events.list', { limit: 20 }, { cookie }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 200);
  const q = x.calls.find((c) => c.url.includes('/rest/v1/events?'))!;
  assert.match(q.url, new RegExp(`owner_id=eq.${OWNER_ID}`));
  assert.equal((await listEvents(postReq('/api/system/events.list', {}, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher })).status, 403);
});
test('request method and malformed kill body are rejected', async () => {
  const x = setup();
  assert.equal((await getKillState(new Request('https://jarvis.example/x', { method: 'POST' }), { env: ENV, fetch: x.fetcher })).status, 405);
  const r = await updateKillState(postReq('/x', { kill: 'no' }, { authorization: `Bearer ${TOKEN}` }), { env: ENV, fetch: x.fetcher });
  assert.equal(r.status, 400);
});
