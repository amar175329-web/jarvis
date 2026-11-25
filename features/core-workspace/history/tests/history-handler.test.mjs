import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/handler.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-23T03:30:00.000Z';

function setup(overrides = {}) {
  const calls = [];
  const powers = [{
    id: 'history.read', name: 'History read', owner_squad: 'S22',
    description: 'Read redacted owner history', autonomy_default: 0, autonomy_current: 0,
    max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'],
  }];
  const context = {
    env: { SUPABASE_URL: 'https://jarvis.test', SUPABASE_ANON_KEY: 'anon-test' },
    resolveOwner: async () => ({ ok: true, user: { id: OWNER, email: 'owner@example.test' }, accessToken: 'owner.access.token' }),
    insertActivity: async (row) => { calls.push({ kind: 'audit', row }); return { id: 9 }; },
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').at(-1);
      calls.push({ kind: 'db', table, url, init });
      if (table === 'powers') return Response.json(overrides.powers ?? powers);
      if (table === 'system_state') return Response.json(overrides.killRows ?? [{ kill: false, epoch: 4 }]);
      if (table === 'chat_threads' && init.method !== 'POST') return Response.json(overrides.threads ?? [{ id: THREAD, title: 'Study plan', created_at: NOW, updated_at: NOW }]);
      if (table === 'chat_messages') return Response.json(overrides.messages ?? [
        { id: 'm3', thread_id: THREAD, role: 'user', content: 'papa ki bimari', sequence: 3, created_at: NOW, status: 'done' },
        { id: 'm2', thread_id: THREAD, role: 'assistant', content: 'metformin lena', sequence: 2, created_at: NOW, status: 'done' },
        { id: 'm1', thread_id: THREAD, role: 'user', content: 'doodh lana', sequence: 1, created_at: NOW, status: 'done' },
      ]);
      return Response.json([]);
    },
    ...overrides.context,
  };
  return { context, calls };
}

test('history thread list masks private title and uses owner bearer + RLS request', async () => {
  const { context, calls } = setup({ threads: [
    { id: THREAD, title: 'metformin lena', created_at: NOW, updated_at: NOW },
    { id: '33333333-3333-4333-8333-333333333333', title: 'Project ideas', created_at: NOW, updated_at: NOW },
  ] });
  const response = await handle('history.threads.list', new Request('https://local/api/tasks/history.threads.list', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 10 }),
  }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.threads[0].title, 'Private conversation');
  assert.equal(body.data.threads[0].private, true);
  assert.equal(body.data.threads[1].title, 'Project ideas');
  const dbCall = calls.find((call) => call.kind === 'db' && call.table === 'chat_threads');
  assert.equal(dbCall.init.headers.Authorization, 'Bearer owner.access.token');
  assert.equal(dbCall.init.headers.apikey, 'anon-test');
  assert.equal(JSON.stringify(body).includes('metformin'), false);
});

test('history messages redact medical and family content but preserve normal message', async () => {
  const { context } = setup();
  const response = await handle('history.messages.list', new Request('https://local/api/tasks/history.messages.list', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: THREAD, limit: 20 }),
  }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.messages[0].content, 'doodh lana');
  assert.equal(body.data.messages[1].content, 'Private message hidden');
  assert.equal(body.data.messages[1].private, true);
  assert.equal(body.data.messages[2].content, 'Private message hidden');
  assert.equal(JSON.stringify(body).includes('metformin'), false);
  assert.equal(JSON.stringify(body).includes('papa ki bimari'), false);
});

test('history fails closed when the registered power is absent', async () => {
  const { context, calls } = setup({ powers: [] });
  const response = await handle('history.threads.list', new Request('https://local/api/tasks/history.threads.list', { method: 'POST', body: '{}' }), context);
  assert.equal(response.status, 403);
  assert.equal(calls.some((call) => call.kind === 'db' && call.table === 'chat_threads'), false);
});

test('history fails closed when kill switch cannot be read', async () => {
  const { context, calls } = setup({ killRows: [] });
  const response = await handle('history.threads.list', new Request('https://local/api/tasks/history.threads.list', { method: 'POST', body: '{}' }), context);
  assert.equal(response.status, 403);
  assert.equal(calls.some((call) => call.kind === 'db' && call.table === 'chat_threads'), false);
});

test('history rejects an invalid thread id before loading messages', async () => {
  const { context, calls } = setup();
  const response = await handle('history.messages.list', new Request('https://local/api/tasks/history.messages.list', {
    method: 'POST', body: JSON.stringify({ thread_id: 'not-a-uuid' }),
  }), context);
  assert.equal(response.status, 400);
  assert.equal(calls.some((call) => call.kind === 'db' && call.table === 'chat_messages'), false);
});


test('history read requires explicit confirmation at L2', async () => {
  const levelTwo = [{
    id: 'history.read', name: 'History read', owner_squad: 'S22',
    description: 'Read redacted owner history', autonomy_default: 0, autonomy_current: 2,
    max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'],
  }];
  const first = setup({ powers: levelTwo });
  const blocked = await handle('history.threads.list', new Request('https://local/api/tasks/history.threads.list', {
    method: 'POST', body: JSON.stringify({ limit: 10 }),
  }), first.context);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'confirmation_required');
  assert.equal(first.calls.some((call) => call.kind === 'audit'), false);
  assert.equal(first.calls.some((call) => call.kind === 'db' && call.table === 'chat_threads'), false);

  const second = setup({ powers: levelTwo });
  const confirmed = await handle('history.threads.list', new Request('https://local/api/tasks/history.threads.list', {
    method: 'POST', body: JSON.stringify({ limit: 10, confirmed: true }),
  }), second.context);
  assert.equal(confirmed.status, 200);
});
