import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, actions } from '../src/handler.ts';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOARD = '11111111-1111-4111-8111-111111111111';
const COLUMN = '22222222-2222-4222-8222-222222222222';
const SAFE_TASK = '33333333-3333-4333-8333-333333333333';
const PRIVATE_TASK = '44444444-4444-4444-8444-444444444444';
const LINK = '55555555-5555-4555-8555-555555555555';
const DECISION = '66666666-6666-4666-8666-666666666666';

function power(id, level = 0) {
  return { id, name: id, owner_squad: 'S10', autonomy_default: 0, autonomy_current: level, max_level: 2, needs_confirm: true, reversible: true, tags: ['personal'] };
}
function setup({ levels = {}, kill = false, privateTask = true } = {}) {
  const calls = [];
  const audit = [];
  const powers = Object.entries(levels).map(([id, level]) => power(id, level));
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1);
    const method = init.method ?? 'GET';
    calls.push({ table, method, query: Object.fromEntries(url.searchParams.entries()), body: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) });
    if (table === 'powers') return Response.json(powers);
    if (table === 'system_state') return Response.json([{ kill, epoch: 1 }]);
    if (table === 's10_boards') {
      if (method === 'POST') return Response.json([{ id: BOARD, name: 'Quarterly', created_at: '2026-11-20T00:00:00Z' }]);
      if (method === 'GET') return Response.json([{ id: BOARD, name: 'Quarterly', created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-21T00:00:00Z' }]);
      return Response.json([]);
    }
    if (table === 's10_board_columns') {
      if (method === 'POST') return Response.json([]);
      return Response.json([{ id: COLUMN, board_id: BOARD, name: 'Doing', position: 0 }]);
    }
    if (table === 's10_board_task_links') {
      if (method === 'POST') return Response.json([{ id: LINK }]);
      if (method === 'GET') return Response.json([
        { id: LINK, board_id: BOARD, column_id: COLUMN, task_id: SAFE_TASK, position: 0 },
        { id: '77777777-7777-4777-8777-777777777777', board_id: BOARD, column_id: COLUMN, task_id: PRIVATE_TASK, position: 1 },
      ]);
      return Response.json([]);
    }
    if (table === 'tasks') {
      const task = privateTask
        ? { id: PRIVATE_TASK, title: 'papa ki dawai', notes: null, status: 'todo', priority: 2, due_at: null }
        : { id: SAFE_TASK, title: 'Ship homepage', notes: null, status: 'doing', priority: 2, due_at: null };
      if (url.searchParams.get('id')?.startsWith('in.') || url.searchParams.get('status') === 'in.(todo,doing)') return Response.json([
        { id: SAFE_TASK, title: 'Ship homepage', notes: null, status: 'doing', priority: 2, due_at: null },
        { id: PRIVATE_TASK, title: 'papa ki dawai', notes: null, status: 'todo', priority: 1, due_at: null },
      ]);
      return Response.json([task]);
    }
    if (table === 'decisions') {
      if (method === 'POST') return Response.json([{ id: DECISION }]);
      return Response.json([]);
    }
    if (table === 'activity_log') return Response.json([]);
    throw new Error(`Unexpected table ${table} ${method}`);
  };
  const context = {
    env: { SUPABASE_URL: 'https://jarvis.test', SUPABASE_ANON_KEY: 'anon-test-key' },
    fetch,
    resolveOwner: async () => ({ ok: true, user: { id: OWNER, email: 'owner@example.test' }, accessToken: 'owner-user-jwt' }),
    insertActivity: async (row) => { audit.push(row); return { id: audit.length }; },
  };
  return { context, calls, audit };
}
function request(body) {
  return new Request('https://jarvis.test/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner-user-jwt' }, body: JSON.stringify(body),
  });
}

test('Boards exposes only the declared action set', () => assert.deepEqual(actions, [
  'boards.list', 'boards.tasks.available', 'boards.create', 'boards.column.create',
  'boards.column.rename', 'boards.task.link', 'boards.task.move', 'boards.task.unlink', 'boards.delete',
]));

test('board reads mask private task titles and do not leak private task text', async () => {
  const env = setup({ levels: { 'boards.read': 0 } });
  const response = await handle('boards.list', request({}), env.context);
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.equal(raw.includes('papa ki dawai'), false);
  const body = JSON.parse(raw);
  const cards = body.data.boards[0].columns[0].cards;
  assert.equal(cards.find((card) => card.id === PRIVATE_TASK).title, 'Private task');
  assert.equal(cards.find((card) => card.id === PRIVATE_TASK).private, true);
  assert.equal('status' in cards.find((card) => card.id === PRIVATE_TASK), false);
  assert.equal('priority' in cards.find((card) => card.id === PRIVATE_TASK), false);
  assert.equal('due_at' in cards.find((card) => card.id === PRIVATE_TASK), false);
  assert.equal('link_id' in cards.find((card) => card.id === PRIVATE_TASK), false);
  assert.equal(cards.find((card) => card.id === SAFE_TASK).title, 'Ship homepage');
  assert.equal(env.audit.length, 1);
});

test('available board tasks excludes private tasks completely', async () => {
  const env = setup({ levels: { 'boards.read': 0 } });
  const response = await handle('boards.tasks.available', request({}), env.context);
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.equal(raw.includes('papa ki dawai'), false);
  assert.equal(raw.includes(PRIVATE_TASK), false);
  assert.equal(raw.includes(SAFE_TASK), true);
});

test('unknown/missing board read power fails closed before task tables are read', async () => {
  const env = setup();
  const response = await handle('boards.list', request({}), env.context);
  assert.equal(response.status, 403);
  assert.equal(env.calls.some((call) => call.table === 's10_boards'), false);
});

test('L0 board mutation is observe-only and never writes a board', async () => {
  const env = setup({ levels: { 'boards.create': 0 } });
  const response = await handle('boards.create', request({ name: 'Project board' }), env.context);
  assert.equal(response.status, 403);
  assert.equal(env.calls.some((call) => call.table === 's10_boards' && call.method === 'POST'), false);
  assert.equal(env.calls.some((call) => call.table === 'decisions' && call.method === 'POST'), true);
  assert.equal(env.audit.every((entry) => !JSON.stringify(entry).includes('Project board')), true);
});

test('L2 board mutation requires a second confirmed request', async () => {
  const env = setup({ levels: { 'boards.create': 2 } });
  const blocked = await handle('boards.create', request({ name: 'Project board' }), env.context);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'confirmation_required');
  assert.equal(env.calls.some((call) => call.table === 's10_boards' && call.method === 'POST'), false);
  const allowed = await handle('boards.create', request({ name: 'Project board', confirmed: true }), env.context);
  assert.equal(allowed.status, 200);
  assert.equal(env.calls.some((call) => call.table === 's10_boards' && call.method === 'POST'), true);
});

test('ON kill switch blocks a board mutation before any board write', async () => {
  const env = setup({ levels: { 'boards.create': 2 }, kill: true });
  const response = await handle('boards.create', request({ name: 'Project board', confirmed: true }), env.context);
  assert.equal(response.status, 403);
  assert.equal(env.calls.some((call) => call.table === 's10_boards' && call.method === 'POST'), false);
});

test('private task cannot be linked even after L2 confirmation', async () => {
  const env = setup({ levels: { 'boards.task.link': 2 } });
  const response = await handle('boards.task.link', request({ board_id: BOARD, column_id: COLUMN, task_id: PRIVATE_TASK, confirmed: true }), env.context);
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal((await response.json()).error.code, 'private_content');
  assert.equal(env.calls.some((call) => call.table === 's10_board_task_links' && call.method === 'POST'), false);
});

test('Supabase requests use anon key and owner bearer, with no service key', async () => {
  const env = setup({ levels: { 'boards.read': 0 } });
  const response = await handle('boards.list', request({}), env.context);
  assert.equal(response.status, 200);
  for (const call of env.calls) {
    assert.equal(call.headers.get('apikey'), 'anon-test-key');
    assert.equal(call.headers.get('authorization'), 'Bearer owner-user-jwt');
    assert.equal(call.headers.has('service-role'), false);
  }
});
