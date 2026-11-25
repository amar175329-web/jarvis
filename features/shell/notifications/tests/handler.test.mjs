import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, NOTIFICATION_ACTIONS } from '../src/handler.mjs';

function response(rows) { return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } }); }
function contextFor({ events = [], settings = [], power = { executed: true }, auth = { ok: true, user: { id: 'owner-1' }, accessToken: 'owner-bearer-token-123456789' } } = {}) {
  const calls = [];
  const context = {
    requireOwner: async () => auth,
    supabase: { url: 'https://supabase.test', anonKey: 'anon-public-key', fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/events?')) return response(events);
      if (String(url).includes('/settings?') && init.method === 'POST') return new Response(null, { status: 204 });
      return response(settings);
    } },
    executePower: async (args) => { calls.push({ power: args.powerId, why: args.why }); if (power.executed) return { executed: true, result: await args.run() }; return power; },
  };
  return { context, calls };
}

test('notifications handler exposes only safe metadata from owner-RLS events', async () => {
  const { context, calls } = contextFor({ events: [
    { id: 'e1', type: 'device.paired', ts: '2026-11-23T04:00:00Z', payload: { secret: 'x' } },
    { id: 'e2', type: 'activity.logged', ts: '2026-11-23T04:01:00Z', payload: { summary: 'private' } },
  ] });
  const response = await handle('notifications.list', new Request('https://app.test', { method: 'GET' }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.notifications, [{ id: 'e1', title: 'Device connected', createdAt: '2026-11-23T04:00:00.000Z', unread: true }]);
  assert.equal(JSON.stringify(body).includes('secret'), false);
  assert.ok(calls.every((call) => call.init.headers.apikey === 'anon-public-key' && call.init.headers.Authorization.includes('owner-bearer-token')));
});

test('notifications mark-read requires explicit confirmation and registered power', async () => {
  const { context, calls } = contextFor({ events: [{ id: 'e1', type: 'device.paired', ts: '2026-11-23T04:00:00Z' }] });
  const bad = await handle('notifications.mark-read', new Request('https://app.test', { method: 'POST', body: JSON.stringify({}) }), context);
  assert.equal(bad.status, 400);
  const good = await handle('notifications.mark-read', new Request('https://app.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) }), context);
  assert.equal(good.status, 200);
  assert.ok(calls.some((x) => x.power === 'notifications.mark-read'));
  const write = calls.find((x) => x.init?.method === 'POST');
  assert.ok(write);
  assert.equal(write.init.headers.apikey, 'anon-public-key');
});

test('notifications handler fails closed when owner or power is unavailable', async () => {
  const unauth = contextFor({ auth: { ok: false, status: 401 } });
  assert.equal((await handle('notifications.list', new Request('https://app.test'), unauth.context)).status, 401);
  const blocked = contextFor({ events: [{ id: 'e1', type: 'device.paired', ts: '2026-11-23T04:00:00Z' }], power: { executed: false } });
  const result = await handle('notifications.mark-read', new Request('https://app.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) }), blocked.context);
  assert.equal(result.status, 403);
  assert.deepEqual(NOTIFICATION_ACTIONS, ['notifications.list', 'notifications.mark-read']);
});
