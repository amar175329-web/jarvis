import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as tasksPost } from '../api/tasks/index.ts';
import { SESSION_COOKIE } from '../api/auth/index.ts';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';
const TASK_A1 = '11111111-1111-4111-8111-111111111111';
const REM_A1 = '22222222-2222-4222-8222-222222222222';
const DEC_1 = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-25T10:00:00.000Z';

function envFor(ownerEmail: string) {
  return {
    SUPABASE_URL: 'https://jarvis-test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    OWNER_EMAIL: ownerEmail,
  };
}

function cookieFor(token: string) {
  const payload = Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'refresh-tok-12345678901234567890', issued_at: Date.now() })).toString('base64url');
  return `${SESSION_COOKIE}=${payload}`;
}

function makePowers(overrides: Record<string, { current?: number; max?: number }> = {}) {
  const defs: Array<[string, string, number, number, boolean]> = [
    ['tasks.create', 'S08', 2, 2, true],
    ['tasks.update', 'S08', 2, 2, true],
    ['tasks.delete', 'S08', 2, 2, false],
    ['reminders.create', 'S08', 2, 2, true],
    ['reminders.update', 'S08', 2, 2, true],
    ['reminders.complete', 'S08', 2, 2, true],
    ['reminders.delete', 'S08', 2, 2, false],
    ['reminders.cancel', 'S08', 2, 2, true],
    ['history.read', 'S05', 0, 2, true],
    ['activity-logs.read', 'S05', 0, 2, true],
    ['memory.list', 'S09', 0, 2, true],
    ['memory.remember', 'S09', 2, 2, true],
    ['workspace.notes.list', 'S09', 0, 2, true],
    ['workspace.notes.create', 'S09', 2, 2, true],
    ['workspace.projects.list', 'S09', 0, 2, true],
  ];
  return defs.map(([id, owner_squad, cur, max, reversible]) => ({
    id,
    name: id,
    owner_squad,
    description: id,
    autonomy_default: overrides[id]?.current ?? cur,
    autonomy_current: overrides[id]?.current ?? cur,
    max_level: overrides[id]?.max ?? max,
    needs_confirm: true,
    reversible,
    tags: ['personal'],
  }));
}

type SimState = {
  killMode: 'off' | 'on' | 'unreadable';
  calls: Array<{ method: string; path: string; search: string; auth: string | null; apikey: string | null }>;
  tasks: Array<{ id: string; owner_id: string; title: string; due_at: string | null; ends_at: string | null; status: string; priority: number; focus_today: boolean; repeat_rule: string | null; time_zone: string }>;
  reminders: Array<{ id: string; owner_id: string; text: string; remind_at: string; repeat_rule: string | null; time_zone: string; state: string }>;
  notes: Array<{ id: string; owner_id: string; title: string; body_md: string; tags: string[]; project_id: string | null; pinned: boolean; status: string; source: string; no_embed: boolean; tokens: string[]; word_count: number; revision: number; private: boolean; tier: string; created_at: string; updated_at: string }>;
  threads: Array<{ id: string; owner_id: string; title: string; created_at: string; updated_at: string }>;
  activities: Array<{ id: string; owner_id: string; ts: string; actor: string; action: string; target: string | null; detail: Record<string, unknown>; decision_id: string | null; ok: boolean }>;
};

function createSimFetch(state: SimState): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const auth = headers.get('authorization');
    const apikey = headers.get('apikey');
    state.calls.push({ method, path: url.pathname, search: url.search, auth, apikey });

    const ownerId = auth === 'Bearer tok-a-12345678901234567890'
      ? OWNER_A
      : auth === 'Bearer tok-b-12345678901234567890'
        ? OWNER_B
        : null;

    if (url.pathname === '/auth/v1/user') {
      if (!ownerId) return Response.json({ message: 'unauthorized' }, { status: 401 });
      return Response.json({ id: ownerId, email: ownerId === OWNER_A ? 'owner-a@example.com' : 'owner-b@example.com' });
    }
    if (!ownerId || apikey !== 'test-anon-key') {
      return Response.json({ message: 'forbidden' }, { status: 403 });
    }

    if (url.pathname === '/rest/v1/powers') {
      return Response.json(makePowers());
    }
    if (url.pathname === '/rest/v1/system_state') {
      if (state.killMode === 'unreadable') return Response.json({ message: 'db error' }, { status: 500 });
      return Response.json([{ kill: state.killMode === 'on', epoch: 3, changed_at: NOW }]);
    }
    if (url.pathname === '/rest/v1/decisions') {
      if (method === 'POST') return Response.json([{ id: DEC_1 }], { status: 201 });
      if (method === 'PATCH') return new Response(null, { status: 204 });
    }
    if (url.pathname === '/rest/v1/activity_log') {
      if (method === 'POST') return Response.json([{ id: '101' }], { status: 201 });
      const reqOwner = url.searchParams.get('owner_id');
      return Response.json(state.activities.filter((a) => `eq.${a.owner_id}` === reqOwner && a.owner_id === ownerId));
    }
    if (url.pathname === '/rest/v1/chat_threads') {
      const reqOwner = url.searchParams.get('owner_id');
      return Response.json(state.threads.filter((t) => `eq.${t.owner_id}` === reqOwner && t.owner_id === ownerId));
    }
    if (url.pathname === '/rest/v1/notes') {
      const reqOwner = url.searchParams.get('owner_id');
      if (method === 'GET') {
        return Response.json(state.notes.filter((n) => `eq.${n.owner_id}` === reqOwner && n.owner_id === ownerId));
      }
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const row = { id: '44444444-4444-4444-8444-444444444444', created_at: NOW, updated_at: NOW, ...body };
        state.notes.push(row);
        return Response.json([row], { status: 201 });
      }
    }
    if (url.pathname === '/rest/v1/memories') {
      return Response.json([], { headers: { 'content-range': '0-0/0' } });
    }
    if (url.pathname === '/rest/v1/tasks') {
      if (method === 'GET') {
        const idFilter = url.searchParams.get('id');
        let rows = state.tasks.filter((t) => t.owner_id === ownerId);
        if (idFilter?.startsWith('eq.')) rows = rows.filter((t) => t.id === idFilter.slice(3));
        return Response.json(rows);
      }
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const row = { id: '55555555-5555-4555-8555-555555555555', owner_id: ownerId, ...body };
        state.tasks.push(row);
        return Response.json([row], { status: 201 });
      }
      if (method === 'DELETE') {
        const idFilter = url.searchParams.get('id')?.slice(3);
        const idx = state.tasks.findIndex((t) => t.id === idFilter && t.owner_id === ownerId);
        if (idx === -1) return Response.json([]);
        const [removed] = state.tasks.splice(idx, 1);
        return Response.json([{ id: removed.id }]);
      }
    }
    if (url.pathname === '/rest/v1/reminders') {
      if (method === 'GET') {
        return Response.json(state.reminders.filter((r) => r.owner_id === ownerId));
      }
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const row = { id: '66666666-6666-4666-8666-666666666666', owner_id: ownerId, ...body };
        state.reminders.push(row);
        return Response.json([row], { status: 201 });
      }
    }
    if (url.pathname === '/rest/v1/jobs') {
      return new Response(null, { status: 201 });
    }
    if (url.pathname === '/rest/v1/rpc/s08_delete_reminder') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const idx = state.reminders.findIndex((r) => r.id === body.p_reminder_id && r.owner_id === ownerId);
      if (idx === -1) return Response.json([]);
      const [removed] = state.reminders.splice(idx, 1);
      return Response.json([{ id: removed.id }]);
    }
    if (url.pathname === '/rest/v1/rpc/s08_set_reminder_state') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const row = state.reminders.find((r) => r.id === body.p_reminder_id && r.owner_id === ownerId);
      if (!row) return Response.json([]);
      row.state = body.p_state;
      return Response.json([row]);
    }
    if (url.pathname === '/rest/v1/rpc/s08_replace_reminder') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const row = state.reminders.find((r) => r.id === body.p_reminder_id && r.owner_id === ownerId);
      if (!row) return Response.json([]);
      row.text = body.p_text;
      row.remind_at = body.p_remind_at;
      return Response.json([row]);
    }
    return Response.json({ message: `unhandled ${method} ${url.pathname}` }, { status: 404 });
  };
}

function baseState(killMode: 'off' | 'on' | 'unreadable' = 'off'): SimState {
  return {
    killMode,
    calls: [],
    tasks: [{
      id: TASK_A1, owner_id: OWNER_A, title: 'Owner A Meeting',
      due_at: '2026-11-26T09:00:00.000Z', ends_at: '2026-11-26T10:00:00.000Z',
      status: 'todo', priority: 2, focus_today: false, repeat_rule: null, time_zone: 'Asia/Kolkata',
    }],
    reminders: [{
      id: REM_A1, owner_id: OWNER_A, text: 'Call Sam',
      remind_at: '2026-11-26T11:00:00.000Z', repeat_rule: null, time_zone: 'Asia/Kolkata', state: 'pending',
    }],
    notes: [{
      id: '77777777-7777-4777-8777-777777777777', owner_id: OWNER_A, title: 'Owner A Note',
      body_md: 'Hello A', tags: [], project_id: null, pinned: false, status: 'active', source: 'amit',
      no_embed: false, tokens: [], word_count: 2, revision: 1, private: false, tier: 'normal',
      created_at: NOW, updated_at: NOW,
    }],
    threads: [{
      id: '88888888-8888-4888-8888-888888888888', owner_id: OWNER_A, title: 'Owner A Chat',
      created_at: NOW, updated_at: NOW,
    }],
    activities: [{
      id: '1', owner_id: OWNER_A, ts: NOW, actor: 'owner', action: 'tasks.create',
      target: 'task', detail: { result: 'created' }, decision_id: DEC_1, ok: true,
    }],
  };
}

test('Owner A vs Owner B isolation: S09 notes.list, S05 history/activity-logs, S08 B3 tasks.delete & reminders.delete', async () => {
  const state = baseState('off');
  const fetcher = createSimFetch(state);

  // S09 notes.list: Owner A sees own note; Owner B sees 0 notes and owner_id filter is forced to OWNER_B
  const resNotesA = await tasksPost(new Request('https://jarvis.local/api/notes-files/workspace.notes.list', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' },
    body: '{}',
  }), { env: envFor('owner-a@example.com'), fetch: fetcher });
  assert.equal(resNotesA.status, 200);
  const bodyNotesA = await resNotesA.json() as any;
  assert.equal(bodyNotesA.data.normal.length, 1);

  const resNotesB = await tasksPost(new Request('https://jarvis.local/api/notes-files/workspace.notes.list', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: '{}',
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(resNotesB.status, 200);
  const bodyNotesB = await resNotesB.json() as any;
  assert.equal(bodyNotesB.data.normal.length, 0);

  // S05 history.threads.list: Owner B sees 0 of Owner A's threads
  const resHistB = await tasksPost(new Request('https://jarvis.local/api/tasks/history.threads.list', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: '{}',
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(resHistB.status, 200);
  const bodyHistB = await resHistB.json() as any;
  assert.equal(bodyHistB.data.threads.length, 0);

  // S05 activity-logs.list: Owner B sees 0 of Owner A's activity rows
  const resActB = await tasksPost(new Request('https://jarvis.local/api/tasks/activity-logs.list', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: '{}',
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(resActB.status, 200);
  const bodyActB = await resActB.json() as any;
  assert.equal(bodyActB.data.items.length, 0);

  // S08 B3 tasks.delete & reminders.delete: Owner B cannot delete Owner A's rows (404)
  const resDelTaskB = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.delete', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ id: TASK_A1, confirmed: true }),
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(resDelTaskB.status, 404);
  assert.equal(state.tasks.length, 1);

  const resDelRemB = await tasksPost(new Request('https://jarvis.local/api/reminders/reminders.delete', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ id: REM_A1, confirmed: true }),
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(resDelRemB.status, 404);
  assert.equal(state.reminders.length, 1);
});

test('Kill switch ON and unreadable block S09, S05, and S08 B3 handlers (simulated)', async () => {
  for (const mode of ['on', 'unreadable'] as const) {
    const state = baseState(mode);
    const fetcher = createSimFetch(state);
    const headers = { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' };
    const env = envFor('owner-a@example.com');

    const rS09Read = await tasksPost(new Request('https://jarvis.local/api/memory/memory.list', { method: 'POST', headers, body: '{}' }), { env, fetch: fetcher });
    assert.ok(rS09Read.status === 403 || rS09Read.status === 503, `S09 read should block on kill=${mode}, got ${rS09Read.status}`);

    const rS05Hist = await tasksPost(new Request('https://jarvis.local/api/tasks/history.threads.list', { method: 'POST', headers, body: '{}' }), { env, fetch: fetcher });
    assert.ok(rS05Hist.status === 403 || rS05Hist.status === 503, `S05 history should block on kill=${mode}, got ${rS05Hist.status}`);

    const rS05Act = await tasksPost(new Request('https://jarvis.local/api/tasks/activity-logs.list', { method: 'POST', headers, body: '{}' }), { env, fetch: fetcher });
    assert.ok(rS05Act.status === 403 || rS05Act.status === 503, `S05 activity-logs should block on kill=${mode}, got ${rS05Act.status}`);

    const rDelTask = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.delete', { method: 'POST', headers, body: JSON.stringify({ id: TASK_A1, confirmed: true }) }), { env, fetch: fetcher });
    assert.ok(rDelTask.status === 403 || rDelTask.status === 503, `tasks.delete should block on kill=${mode}, got ${rDelTask.status}`);
    assert.equal(state.tasks.length, 1);

    const rRemComp = await tasksPost(new Request('https://jarvis.local/api/reminders/reminders.complete', { method: 'POST', headers, body: JSON.stringify({ id: REM_A1, confirmed: true }) }), { env, fetch: fetcher });
    assert.ok(rRemComp.status === 403 || rRemComp.status === 503, `reminders.complete should block on kill=${mode}, got ${rRemComp.status}`);
    assert.equal(state.reminders[0].state, 'pending');
  }
});

test('Kill switch read starts WITH audit intent write, NEVER before loadPowers', async () => {
  const state = baseState('off');
  const fetcher = createSimFetch(state);
  const res = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.delete', {
    method: 'POST',
    headers: { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ id: TASK_A1, confirmed: true }),
  }), { env: envFor('owner-a@example.com'), fetch: fetcher });
  assert.equal(res.status, 200);
  const restCalls = state.calls.filter((c) => c.path.startsWith('/rest/v1/')).map((c) => `${c.method} ${c.path}`);
  const powersIdx = restCalls.indexOf('GET /rest/v1/powers');
  const intentIdx = restCalls.indexOf('POST /rest/v1/decisions');
  const killIdx = restCalls.indexOf('GET /rest/v1/system_state');
  const delIdx = restCalls.indexOf('DELETE /rest/v1/tasks');
  assert.ok(powersIdx >= 0 && intentIdx > powersIdx, `decisions POST must follow powers GET: ${restCalls.join(', ')}`);
  assert.ok(killIdx > powersIdx && killIdx > intentIdx && killIdx < delIdx, `system_state GET must start with/after intent and before mutation: ${restCalls.join(', ')}`);
});

test('S08 B3 clash 409, adjacent half-open ok, duplicate reminder 409, sensitive edit 409, and S09 110KB vs 12KB body cap', async () => {
  const state = baseState('off');
  const fetcher = createSimFetch(state);
  const headers = { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' };
  const env = envFor('owner-a@example.com');

  // Overlapping range -> 409 time_clash
  const clashRes = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.create', {
    method: 'POST', headers,
    body: JSON.stringify({ title: 'Overlap', due_at: '2026-11-26T09:30:00.000Z', ends_at: '2026-11-26T10:30:00.000Z', confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(clashRes.status, 409);
  assert.equal((await clashRes.json() as any).error.code, 'time_clash');

  // Adjacent half-open [10:00, 11:00) -> 201 OK
  const adjRes = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.create', {
    method: 'POST', headers,
    body: JSON.stringify({ title: 'Adjacent', due_at: '2026-11-26T10:00:00.000Z', ends_at: '2026-11-26T11:00:00.000Z', confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(adjRes.status, 201);

  // Duplicate reminder same normalized text + same minute -> 409 duplicate_reminder
  const dupRem = await tasksPost(new Request('https://jarvis.local/api/reminders/reminders.create', {
    method: 'POST', headers,
    body: JSON.stringify({ text: '  call sam ', remind_at: '2026-11-26T11:00:30.000Z', confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(dupRem.status, 409);
  assert.equal((await dupRem.json() as any).error.code, 'duplicate_reminder');

  // Sensitive reminder update -> 409 privacy_confirmation without DB write
  const sensRem = await tasksPost(new Request('https://jarvis.local/api/reminders/reminders.update', {
    method: 'POST', headers,
    body: JSON.stringify({ id: REM_A1, text: 'BP ki dawai leni hai', remind_at: '2026-11-26T12:00:00.000Z', confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(sensRem.status, 409);
  assert.equal((await sensRem.json() as any).error.code, 'privacy_confirmation');

  // Body cap: 20KB note create allowed (<=110KB), 20KB task create rejected (413)
  const big20k = 'a'.repeat(20_000);
  const note20k = await tasksPost(new Request('https://jarvis.local/api/notes-files/workspace.notes.create', {
    method: 'POST', headers,
    body: JSON.stringify({ title: 'Long Note', body_md: big20k, confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(note20k.status, 200);

  const task20k = await tasksPost(new Request('https://jarvis.local/api/tasks/tasks.create', {
    method: 'POST', headers,
    body: JSON.stringify({ title: 'Big', notes: big20k, confirmed: true }),
  }), { env, fetch: fetcher });
  assert.equal(task20k.status, 413);
});
