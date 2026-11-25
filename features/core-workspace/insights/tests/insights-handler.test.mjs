import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, actions } from '../src/handler.ts';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SAFE_TASK = '11111111-1111-4111-8111-111111111111';
const PRIVATE_TASK = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-23T12:00:00.000Z');

function power(id, level = 0) {
  return { id, name: id, owner_squad: 'S10', autonomy_default: 0, autonomy_current: level, max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'] };
}
function setup({ level = 0, kill = false, unreadableKill = false } = {}) {
  const calls = [];
  const audit = [];
  const tasks = [
    { status: 'done' },
    { status: 'todo' },
  ];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1);
    const method = init.method ?? 'GET';
    calls.push({ table, method, select: url.searchParams.get('select'), query: Object.fromEntries(url.searchParams.entries()), headers: new Headers(init.headers) });
    if (table === 'powers') return Response.json([power('insights.read', level)]);
    if (table === 'system_state') return unreadableKill ? new Response('missing', { status: 500 }) : Response.json([{ kill, epoch: 1 }]);
    if (table === 'tasks') {
      if (url.searchParams.get('select') === 'id') return Response.json([{ id: PRIVATE_TASK }]);
      return Response.json(tasks);
    }
    if (table === 'activity_log') return Response.json([
      { ts: '2026-11-22T10:00:00.000Z', ok: true },
      { ts: '2026-11-22T11:00:00.000Z', ok: false },
    ]);
    throw new Error(`Unexpected table ${table} ${method}`);
  };
  const context = {
    env: { SUPABASE_URL: 'https://jarvis.test', SUPABASE_ANON_KEY: 'anon-test-key' },
    fetch,
    resolveOwner: async () => ({ ok: true, user: { id: OWNER, email: 'owner@example.test' }, accessToken: 'owner-user-jwt' }),
    insertActivity: async (row) => { audit.push(row); return { id: audit.length }; },
    now: () => NOW,
  };
  return { context, calls, audit };
}
function request(body) {
  return new Request('https://jarvis.test/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner-user-jwt' }, body: JSON.stringify(body),
  });
}

test('Insights is a registered, narrow read-only action', () => assert.deepEqual(actions, ['insights.overview']));

test('insights returns aggregate-only projections and never selects task or activity text', async () => {
  const env = setup();
  const response = await handle('insights.overview', request({ period_days: 7 }), env.context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.tasks, { total: 2, todo: 1, doing: 0, done: 1, cancelled: 0, overdue: 1, completion_rate: 50 });
  assert.equal(body.data.activity.total, 2);
  assert.equal(body.data.activity.successful, 1);
  const taskReads = env.calls.filter((call) => call.table === 'tasks' && call.method === 'GET');
  assert.ok(taskReads.every((call) => call.select === 'status' || call.select === 'id'));
  assert.ok(env.calls.filter((call) => call.table === 'activity_log' && call.method === 'GET').every((call) => call.select === 'ts,ok'));
  assert.equal(env.audit.length, 1);
  assert.equal(env.audit[0].action, 'insights.overview');
  assert.equal(JSON.stringify(body).includes('Private'), false);
});

test('L2 Insights read needs explicit confirmation before projections are fetched', async () => {
  const env = setup({ level: 2 });
  const blocked = await handle('insights.overview', request({ period_days: 7 }), env.context);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'confirmation_required');
  assert.equal(env.calls.some((call) => call.table === 'tasks'), false);
  const allowed = await handle('insights.overview', request({ period_days: 7, confirmed: true }), env.context);
  assert.equal(allowed.status, 200);
});

test('Insights fails closed when the kill-switch state cannot be read', async () => {
  const env = setup({ unreadableKill: true });
  const response = await handle('insights.overview', request({ period_days: 30 }), env.context);
  assert.equal(response.status, 503);
  assert.equal(env.calls.some((call) => call.table === 'tasks'), false);
});

test('Insights sends only anon-key plus the verified owner bearer to Supabase', async () => {
  const env = setup();
  const response = await handle('insights.overview', request({ period_days: 7 }), env.context);
  assert.equal(response.status, 200);
  for (const call of env.calls) {
    assert.equal(call.headers.get('apikey'), 'anon-test-key');
    assert.equal(call.headers.get('authorization'), 'Bearer owner-user-jwt');
    assert.equal(call.headers.has('service-role'), false);
  }
});
