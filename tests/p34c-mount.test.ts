import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as tasksPost } from '../api/tasks/index.ts';
import { createReadOnlyChatMemoryPort } from '../api/chat/index.ts';
import { SESSION_COOKIE } from '../api/auth/index.ts';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';
const BOARD_A1 = '11111111-1111-4111-8111-111111111111';
const COL_A1 = '22222222-2222-4222-8222-222222222222';
const DEC_1 = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-27T10:00:00.000Z';

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

function s10Powers() {
  return [
    { id: 'insights.read', name: 'Insights read', owner_squad: 'S10', description: 'read', autonomy_default: 4, autonomy_current: 4, max_level: 4, needs_confirm: false, reversible: true, tags: [] },
    { id: 'boards.read', name: 'Boards read', owner_squad: 'S10', description: 'read', autonomy_default: 4, autonomy_current: 4, max_level: 4, needs_confirm: false, reversible: true, tags: [] },
    { id: 'boards.create', name: 'Boards create', owner_squad: 'S10', description: 'create', autonomy_default: 3, autonomy_current: 3, max_level: 4, needs_confirm: false, reversible: true, tags: [] },
    { id: 'boards.delete', name: 'Boards delete', owner_squad: 'S10', description: 'delete', autonomy_default: 2, autonomy_current: 2, max_level: 2, needs_confirm: true, reversible: false, tags: ['personal'] },
  ];
}

type SimState = {
  killMode: 'off' | 'on' | 'unreadable';
  tasks: Array<{ id: string; owner_id: string; status: string; created_at: string; due_at: string | null }>;
  activities: Array<{ id: string; owner_id: string; ts: string; ok: boolean }>;
  boards: Array<{ id: string; owner_id: string; name: string; created_at: string; updated_at: string }>;
  columns: Array<{ id: string; board_id: string; owner_id: string; name: string; position: number }>;
};

function createSimFetch(state: SimState): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const auth = headers.get('authorization');
    const apikey = headers.get('apikey');

    const ownerId = auth === 'Bearer tok-a-12345678901234567890'
      ? OWNER_A
      : auth === 'Bearer tok-b-12345678901234567890'
        ? OWNER_B
        : null;

    if (url.pathname === '/auth/v1/user') {
      if (!ownerId) return Response.json({ message: 'unauthorized' }, { status: 401 });
      return Response.json({ id: ownerId, email: ownerId === OWNER_A ? 'owner-a@example.com' : 'owner-b@example.com' });
    }
    if (!ownerId || apikey !== 'test-anon-key') return Response.json({ message: 'forbidden' }, { status: 403 });

    if (url.pathname === '/rest/v1/powers') return Response.json(s10Powers());
    if (url.pathname === '/rest/v1/system_state') {
      if (state.killMode === 'unreadable') return Response.json({ message: 'db down' }, { status: 500 });
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
    if (url.pathname === '/rest/v1/tasks') {
      const reqOwner = url.searchParams.get('owner_id');
      return Response.json(state.tasks.filter((t) => `eq.${t.owner_id}` === reqOwner && t.owner_id === ownerId));
    }
    if (url.pathname === '/rest/v1/s10_boards') {
      const reqOwner = url.searchParams.get('owner_id');
      if (method === 'GET') return Response.json(state.boards.filter((b) => `eq.${b.owner_id}` === reqOwner && b.owner_id === ownerId));
      if (method === 'DELETE') {
        const bid = url.searchParams.get('id')?.slice(3);
        const idx = state.boards.findIndex((b) => b.id === bid && b.owner_id === ownerId && `eq.${b.owner_id}` === reqOwner);
        if (idx === -1) return Response.json([]);
        const [removed] = state.boards.splice(idx, 1);
        return Response.json([{ id: removed.id }]);
      }
    }
    if (url.pathname === '/rest/v1/s10_board_columns') {
      const reqOwner = url.searchParams.get('owner_id');
      return Response.json(state.columns.filter((c) => `eq.${c.owner_id}` === reqOwner && c.owner_id === ownerId));
    }
    if (url.pathname === '/rest/v1/s10_board_task_links') {
      return Response.json([]);
    }
    return Response.json({ message: `unhandled ${method} ${url.pathname}` }, { status: 404 });
  };
}

function baseState(killMode: 'off' | 'on' | 'unreadable' = 'off'): SimState {
  return {
    killMode,
    tasks: [{ id: '44444444-4444-4444-8444-444444444444', owner_id: OWNER_A, status: 'done', created_at: NOW, due_at: null }],
    activities: [{ id: '1', owner_id: OWNER_A, ts: NOW, ok: true }],
    boards: [{ id: BOARD_A1, owner_id: OWNER_A, name: 'Owner A Sprint', created_at: NOW, updated_at: NOW }],
    columns: [{ id: COL_A1, board_id: BOARD_A1, owner_id: OWNER_A, name: 'To do', position: 0 }],
  };
}

test('S10 Owner A vs Owner B isolation: insights.overview, boards.list, and boards.delete', async () => {
  const state = baseState('off');
  const fetcher = createSimFetch(state);

  const insA = await tasksPost(new Request('https://jarvis.local/api/tasks/insights.overview', {
    method: 'POST', headers: { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ period_days: 7 }),
  }), { env: envFor('owner-a@example.com'), fetch: fetcher });
  assert.equal(insA.status, 200);
  const bodyInsA = await insA.json() as any;
  assert.equal(bodyInsA.data.tasks.done, 1);

  const insB = await tasksPost(new Request('https://jarvis.local/api/tasks/insights.overview', {
    method: 'POST', headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ period_days: 7 }),
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(insB.status, 200);
  const bodyInsB = await insB.json() as any;
  assert.equal(bodyInsB.data.tasks.total, 0);

  const boardsB = await tasksPost(new Request('https://jarvis.local/api/tasks/boards.list', {
    method: 'POST', headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(boardsB.status, 200);
  assert.equal(((await boardsB.json()) as any).data.boards.length, 0);

  const delBoardB = await tasksPost(new Request('https://jarvis.local/api/tasks/boards.delete', {
    method: 'POST', headers: { cookie: cookieFor('tok-b-12345678901234567890'), 'content-type': 'application/json' },
    body: JSON.stringify({ board_id: BOARD_A1, confirmed: true }),
  }), { env: envFor('owner-b@example.com'), fetch: fetcher });
  assert.equal(delBoardB.status, 200);
  assert.equal(state.boards.length, 1, 'Owner A board must remain untouched when Owner B calls boards.delete');
  assert.equal(state.boards[0].id, BOARD_A1);
});

test('S10 Kill switch ON and unreadable block insights.overview, boards.list, and boards.delete', async () => {
  for (const mode of ['on', 'unreadable'] as const) {
    const state = baseState(mode);
    const fetcher = createSimFetch(state);
    const headers = { cookie: cookieFor('tok-a-12345678901234567890'), 'content-type': 'application/json' };
    const env = envFor('owner-a@example.com');

    const rIns = await tasksPost(new Request('https://jarvis.local/api/tasks/insights.overview', { method: 'POST', headers, body: JSON.stringify({ period_days: 7 }) }), { env, fetch: fetcher });
    assert.ok(rIns.status === 403 || rIns.status === 503, `insights.overview must block on kill=${mode}, got ${rIns.status}`);

    const rBoards = await tasksPost(new Request('https://jarvis.local/api/tasks/boards.list', { method: 'POST', headers, body: '{}' }), { env, fetch: fetcher });
    assert.ok(rBoards.status === 403 || rBoards.status === 503, `boards.list must block on kill=${mode}, got ${rBoards.status}`);

    const rDel = await tasksPost(new Request('https://jarvis.local/api/tasks/boards.delete', { method: 'POST', headers, body: JSON.stringify({ board_id: BOARD_A1, confirmed: true }) }), { env, fetch: fetcher });
    assert.ok(rDel.status === 403 || rDel.status === 503, `boards.delete must block on kill=${mode}, got ${rDel.status}`);
    assert.equal(state.boards.length, 1);
  }
});

test('ChatMemoryPort adapter: T1-only, strips private/sensitive text, read-only, uses user JWT + anon key, blocks on kill ON/unreadable', async () => {
  const calls: Array<{ url: string; auth: string | null; apikey: string | null; body?: any }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, auth: headers.get('authorization'), apikey: headers.get('apikey'), body });
    if (url.includes('/rest/v1/memories') && url.includes('pinned=eq.true')) {
      return Response.json([
        { id: '11111111-1111-4111-8111-111111111111', kind: 'preference', title: 'Chai', body: 'Amit ko adrak chai pasand hai', source: 'explicit', confidence: 1, why: 'w', tier: 'normal', private: false, subject: 'amit', subject_key: null, tags: [], pinned: true, status: 'active', superseded_by: null, valid_to: null, revision: 1, ref_type: null, ref_id: null, tokens: ['chai'], embedding_model: null, embedded_at: null, created_at: NOW, updated_at: NOW, expires_at: null, last_used_at: null, use_count: 0 },
        { id: '22222222-2222-4222-8222-222222222222', kind: 'fact', title: 'Meri BP dawai', body: 'Amlodipine 5mg subah 8 baje', source: 'explicit', confidence: 1, why: 'w', tier: 'normal', private: false, subject: 'amit', subject_key: null, tags: [], pinned: true, status: 'active', superseded_by: null, valid_to: null, revision: 1, ref_type: null, ref_id: null, tokens: ['dawai'], embedding_model: null, embedded_at: null, created_at: NOW, updated_at: NOW, expires_at: null, last_used_at: null, use_count: 0 },
      ]);
    }
    if (url.includes('/rest/v1/rpc/memory_search')) {
      assert.equal(body.p_purpose, null, 'ChatMemoryPort must never request T2 purpose');
      return Response.json([]);
    }
    if (url.includes('/rest/v1/rpc/memory_touch')) return Response.json(null);
    return Response.json([]);
  };

  // Kill OFF -> T1 passes, sensitive/medicine row stripped, user JWT + anon key used
  const portOff = createReadOnlyChatMemoryPort(
    { url: 'https://jarvis-test.supabase.co', anonKey: 'test-anon-key', fetcher: fakeFetch },
    OWNER_A,
    'user-jwt-token-12345',
    { async read() { return { kill: false, epoch: 3 }; } },
  );
  const recalled = await portOff.recall({ text: 'chai aur dawai', purpose: 'health_question' as any });
  assert.ok(recalled.block.includes('adrak chai'), 'T1 memory must be included');
  assert.ok(!recalled.block.includes('Amlodipine') && !recalled.block.includes('dawai'), 'Sensitive/medicine text must NEVER reach model');
  assert.ok(calls.every((c) => c.apikey === 'test-anon-key' && c.auth === 'Bearer user-jwt-token-12345'), 'Must use user JWT + anon key only');

  // Read-only remember -> skipped, no DB write
  const beforeCalls = calls.length;
  const rem = await portOff.remember({ text: 'save this', kind: 'fact', origin: 'chat', actor: 'amit', explicit: true } as any);
  assert.equal(rem.verdict.verdict, 'skip');
  assert.equal(calls.length, beforeCalls);

  // Kill ON -> recall blocked (0 DB calls)
  const portOn = createReadOnlyChatMemoryPort(
    { url: 'https://jarvis-test.supabase.co', anonKey: 'test-anon-key', fetcher: fakeFetch },
    OWNER_A,
    'user-jwt-token-12345',
    { async read() { return { kill: true, epoch: 4 }; } },
  );
  const blocked = await portOn.recall({ text: 'chai' });
  assert.equal(blocked.block, '');
  assert.equal(blocked.degraded, 'kill_switch');
  assert.equal(calls.length, beforeCalls);
});
