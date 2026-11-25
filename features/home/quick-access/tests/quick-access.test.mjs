import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHORTCUTS, moveShortcut, normalizeShortcut, normalizeShortcutList, safeHttpsUrl } from '../src/model.mjs';
import { ACTIONS, handle, QUICK_ACCESS_MANAGE_POWER, QUICK_ACCESS_READ_POWER } from '../src/handler.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const req = (action, body = {}, method = 'POST') => new Request(`https://jarvis.test/api/tasks/${action}`, { method, body: method === 'GET' ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('quick access exposes only its two declared actions', () => {
  assert.deepEqual(ACTIONS, ['quick-access.list', 'quick-access.save']);
});

test('safe HTTPS and known internal destinations are accepted', () => {
  assert.equal(safeHttpsUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeShortcut({ id: 'proj', label: 'Projects', icon: 'folder', destination: { type: 'internal', route: 'projects' } }).destination.route, 'projects');
});

test('unsafe URL schemes, credentials, queries, fragments and local addresses are rejected', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,evil', 'https://user:pass@example.com/', 'https://example.com/?token=x', 'https://example.com/#secret', 'https://localhost/', 'https://127.0.0.1/']) {
    assert.equal(safeHttpsUrl(value), null, value);
  }
});

test('shortcut list is bounded and ids are unique', () => {
  assert.equal(normalizeShortcutList([...DEFAULT_SHORTCUTS, ...DEFAULT_SHORTCUTS]), null);
  assert.equal(normalizeShortcutList(Array(9).fill(DEFAULT_SHORTCUTS[0])), null);
});

test('reorder helper moves only valid indexes', () => {
  const moved = moveShortcut(DEFAULT_SHORTCUTS, 0, 2);
  assert.equal(moved[2].id, 'youtube');
  assert.equal(moveShortcut(DEFAULT_SHORTCUTS, -1, 2), DEFAULT_SHORTCUTS);
});

test('list is owner-scoped and gated; default shortcuts do not require a new table', async () => {
  let read, power;
  const response = await handle('quick-access.list', req('quick-access.list'), {
    ownerId: OWNER,
    readSetting: async (args) => { read = args; return null; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(read, { ownerId: OWNER, key: 'home.quick-access' });
  assert.equal(power.powerId, QUICK_ACCESS_READ_POWER);
  assert.equal(body.data.items.length, 3);
});

test('save validates, audits a generic why, and persists only through the registered power', async () => {
  let saved, power;
  const response = await handle('quick-access.save', req('quick-access.save', { items: [...DEFAULT_SHORTCUTS], confirmed: true }), {
    ownerId: OWNER,
    readSetting: async () => null,
    writeSetting: async (args) => { saved = args; },
    runPower: async (args) => { power = args; return { ok: true, result: await args.run() }; },
  });
  assert.equal(response.status, 200);
  assert.equal(power.powerId, QUICK_ACCESS_MANAGE_POWER);
  assert.equal(power.confirmed, true);
  assert.match(power.why, /validated Home shortcut list/);
  assert.deepEqual(saved, { ownerId: OWNER, key: 'home.quick-access', value: { items: [...DEFAULT_SHORTCUTS] } });
});

test('missing power, kill switch or adapter failure fails closed', async () => {
  const response = await handle('quick-access.list', req('quick-access.list'), {
    ownerId: OWNER, readSetting: async () => null,
    runPower: async () => ({ ok: false, status: 403, code: 'forbidden' }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).ok, false);
});
