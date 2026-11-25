import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/handler.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-23T03:30:00.000Z';

function setup(overrides = {}) {
  const calls = [];
  const powers = [{
    id: 'activity-logs.read', name: 'Activity logs read', owner_squad: 'S22',
    description: 'Read redacted owner activity', autonomy_default: 0, autonomy_current: 0,
    max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'],
  }];
  return {
    calls,
    context: {
      env: { SUPABASE_URL: 'https://jarvis.test', SUPABASE_ANON_KEY: 'anon-test' },
      resolveOwner: async () => ({ ok: true, user: { id: OWNER, email: 'owner@example.test' }, accessToken: 'owner.access.token' }),
      insertActivity: async (row) => { calls.push({ kind: 'audit', row }); return { id: 88 }; },
      fetch: async (input, init = {}) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1);
        calls.push({ kind: 'db', table, url, init });
        if (table === 'powers') return Response.json(overrides.powers ?? powers);
        if (table === 'system_state') return Response.json(overrides.killRows ?? [{ kill: false, epoch: 1 }]);
        if (table === 'activity_log') return Response.json(overrides.rows ?? [{
          id: 1, ts: NOW, actor: 'owner', action: 'tasks.create',
          target: 'task', detail: { why: 'password is hunter2', result: 'created', content: 'metformin lena' },
          ok: true, decision_id: null,
        }]);
        return Response.json([]);
      },
    },
  };
}

test('activity log list redacts old private details and uses owner bearer', async () => {
  const { context, calls } = setup();
  const response = await handle('activity-logs.list', new Request('https://local/api/tasks/activity-logs.list', {
    method: 'POST', body: JSON.stringify({ limit: 25 }),
  }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.items[0].detail.why, 'Private detail hidden');
  assert.equal('content' in body.data.items[0].detail, false);
  assert.equal(JSON.stringify(body).includes('hunter2'), false);
  assert.equal(JSON.stringify(body).includes('metformin'), false);
  const read = calls.find((call) => call.kind === 'db' && call.table === 'activity_log');
  assert.equal(read.init.headers.Authorization, 'Bearer owner.access.token');
  assert.equal(read.init.headers.apikey, 'anon-test');
});

test('activity logs fail closed on missing power', async () => {
  const { context, calls } = setup({ powers: [] });
  const response = await handle('activity-logs.list', new Request('https://local/api/tasks/activity-logs.list', {
    method: 'POST', body: '{}',
  }), context);
  assert.equal(response.status, 403);
  assert.equal(calls.some((call) => call.kind === 'db' && call.table === 'activity_log'), false);
});

test('activity logs validate filters and limit', async () => {
  const { context } = setup();
  const response = await handle('activity-logs.list', new Request('https://local/api/tasks/activity-logs.list', {
    method: 'POST', body: JSON.stringify({ limit: 500 }),
  }), context);
  assert.equal(response.status, 400);
});


test('activity log read requires explicit confirmation at L2', async () => {
  const levelTwo = [{
    id: 'activity-logs.read', name: 'Activity logs read', owner_squad: 'S22',
    description: 'Read redacted owner activity', autonomy_default: 0, autonomy_current: 2,
    max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'],
  }];
  const first = setup({ powers: levelTwo });
  const blocked = await handle('activity-logs.list', new Request('https://local/api/tasks/activity-logs.list', {
    method: 'POST', body: JSON.stringify({ limit: 25 }),
  }), first.context);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'confirmation_required');
  assert.equal(first.calls.some((call) => call.kind === 'audit'), false);
  assert.equal(first.calls.some((call) => call.kind === 'db' && call.table === 'activity_log'), false);

  const second = setup({ powers: levelTwo });
  const confirmed = await handle('activity-logs.list', new Request('https://local/api/tasks/activity-logs.list', {
    method: 'POST', body: JSON.stringify({ limit: 25, confirmed: true }),
  }), second.context);
  assert.equal(confirmed.status, 200);
});
